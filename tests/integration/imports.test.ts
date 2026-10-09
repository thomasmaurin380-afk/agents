// Phase 2 — moteur d'import (services réels, base réelle, stockage en mémoire).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import { MemoryStorage, setStorageForTests } from "@/lib/storage";
import type { Actor } from "@/services/actor";
import { asUser, createWorld, ownerSql, type World } from "./fixtures";

const sql = ownerSql();
let w: World;
let imports: typeof import("@/services/imports");
let data: typeof import("@/services/company-data");
let admin: Actor;
let analyst: Actor;
let client1: Actor;
let fy2025: string;
let bankId: string;

const enc = (s: string) => new TextEncoder().encode(s);
const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
const file = (name: string, bytes: Uint8Array) => ({ name, type: "text/csv", bytes });

const FEC_HEAD = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
const fecLine = (num: string, date: string, acc: string, lib: string, d: string, c: string) =>
  ["VT", "Ventes", num, date, acc, lib, "", "", `F${num}`, date, `Facture ${num}`, d, c, "", "", "20251231", "", ""].join("\t");

function staff(userId: string, firmId: string, role: "firm_admin" | "firm_analyst"): Actor {
  return { userId, email: "s@test.invalid", fullName: "s", aal: "aal2", hasVerifiedTotp: true, firms: [{ firmId, role, firmName: "C" }], clientCompanies: [] };
}

beforeAll(async () => {
  setStorageForTests(new MemoryStorage());
  w = await createWorld(sql);
  imports = await import("@/services/imports");
  data = await import("@/services/company-data");
  admin = staff(w.u.admin1, w.f1, "firm_admin");
  analyst = staff(w.u.analyst1, w.f1, "firm_analyst");
  client1 = {
    userId: w.u.client1, email: "c@test.invalid", fullName: "c", aal: "aal1", hasVerifiedTotp: false, firms: [],
    clientCompanies: [{ companyId: w.c.c1, role: "client_owner", companyName: "C1", tradeName: null }],
  };
  fy2025 = (await data.createFiscalYear(analyst, w.c.c1, { startDate: "2025-01-01", endDate: "2025-12-31" })).id;
  bankId = (await data.createBankAccount(analyst, w.c.c1, { bankName: "Banque Test", label: "Compte courant", ibanLast4: "1234" })).id;
});
afterAll(async () => {
  setStorageForTests(null);
  await sql.end();
});

const dataVersion = async (companyId: string) => Number((await sql`select data_version from app.companies where id = ${companyId}`)[0].data_version);

describe("Exercices et comptes bancaires", () => {
  it("refuse un exercice qui chevauche, ou de plus de 24 mois", async () => {
    const overlap = await data.createFiscalYear(admin, w.c.c1, { startDate: "2025-06-01", endDate: "2026-05-31" }).catch((e) => e);
    expect(overlap).toBeInstanceOf(ValidationError);
    expect((overlap as ValidationError).fieldErrors.startDate?.[0]).toMatch(/chevauche/);
    const tooLong = await data.createFiscalYear(admin, w.c.c1, { startDate: "2021-01-01", endDate: "2023-06-30" }).catch((e) => e);
    expect((tooLong as ValidationError).fieldErrors.endDate?.[0]).toMatch(/24 mois/);
  });
  it("un dirigeant ne peut créer ni exercice ni compte bancaire", async () => {
    await expect(data.createFiscalYear(client1, w.c.c1, { startDate: "2026-01-01", endDate: "2026-12-31" })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(data.createBankAccount(client1, w.c.c1, { bankName: "B", label: "L", ibanLast4: "" })).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe("Import d'une balance (CSV Windows-1252, titres, décimales françaises)", () => {
  const csv = (rows: string[]) =>
    latin1(["Balance générale au 31/12/2025", "", "Compte;Intitulé;Solde débit;Solde crédit", ...rows].join("\r\n"));
  const balanced = csv(["101000;Capital;;10 000,00", "512000;Banque;12 500,50;", "401DUPONT;Fournisseur Dupont;;2 500,50", "FDIVERS;Divers;;0,00", "Total;;12 500,50;12 500,50"]);
  let importId: string;

  it("téléversement, correspondance proposée, contrôles, aperçu", async () => {
    importId = (await imports.uploadImport(analyst, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy2025, periodEnd: "2025-12-31", dataStatus: "final", file: file("balance.csv", balanced),
    })).id;
    const ws = await imports.getImportWorkspace(analyst, w.c.c1, importId);
    const p = ws.prepared!;
    expect(p.mapping).toMatchObject({ headerRow: 2, amountMode: "debit_credit", columns: { account_number: 0, account_label: 1, closing_debit: 2, closing_credit: 3 } });
    expect(p.headers).toEqual(["Compte", "Intitulé", "Solde débit", "Solde crédit"]);
    expect(p.blocking).toBe(false);
    expect(p.summary).toMatchObject({ "Lignes de comptes": 4, "Total soldes débiteurs": "12500.50", "Total soldes créditeurs": "12500.50" });
    expect(p.issues.map((i) => i.code)).toContain("ignored_line");
  });

  it("validation : lignes, plan de comptes, version des données, audit, fichier tracé", async () => {
    const before = await dataVersion(w.c.c1);
    await imports.commitImport(analyst, w.c.c1, importId, {});
    const [tb] = await sql`select * from app.trial_balances where source_import_id = ${importId}`;
    expect(tb).toMatchObject({ is_current: true, total_debit: "12500.50", total_credit: "12500.50", line_count: 4, data_status: "final" });
    const lines = await sql`select account_number, closing_debit, closing_credit, source_row from app.trial_balance_lines where trial_balance_id = ${tb.id} order by source_row`;
    expect(lines.map((l) => [l.account_number, l.closing_debit, l.closing_credit, l.source_row])).toEqual([
      ["101000", "0.00", "10000.00", 4], ["512000", "12500.50", "0.00", 5], ["401DUPONT", "0.00", "2500.50", 6], ["FDIVERS", "0.00", "0.00", 7],
    ]);
    const accounts = await sql`select account_number, pcg_account, mapping_status, is_auxiliary from app.chart_of_accounts where company_id = ${w.c.c1} order by account_number`;
    expect(accounts.map((a) => [a.account_number, a.pcg_account, a.mapping_status, a.is_auxiliary])).toEqual([
      ["101000", "101", "auto_validated", false], ["401DUPONT", "401", "auto_validated", true],
      ["512000", "512", "auto_validated", false], ["FDIVERS", null, "to_review", false],
    ]);
    expect(await dataVersion(w.c.c1)).toBe(before + 1);
    const [f] = await sql`select status, report, row_count from app.import_files where id = ${importId}`;
    expect(f.status).toBe("committed");
    expect(f.report.encoding).toBe("windows-1252");
    expect(f.report.accounts).toEqual({ nouveaux: 4, aVerifier: 1 });
    const ignored = await sql`select row_number, status from app.import_rows where import_file_id = ${importId}`;
    expect(ignored.map((r) => [r.row_number, r.status])).toEqual([[8, "ignored"]]);
    expect(await sql`select 1 from app.audit_log where action = 'import.commit' and object_id = ${importId}`).toHaveLength(1);
  });

  it("le même fichier ne peut pas être réimporté", async () => {
    const err = await imports
      .uploadImport(analyst, w.c.c1, { kind: "trial_balance", fiscalYearId: fy2025, periodEnd: "2025-12-31", dataStatus: "final", file: file("copie.csv", balanced) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BusinessRuleError);
    expect(err.message).toMatch(/déjà été importé/);
  });

  it("une nouvelle balance à la même date remplace l'ancienne seulement après confirmation", async () => {
    const v2 = csv(["101000;Capital;;10 000,00", "512000;Banque;12 600,50;", "401DUPONT;Fournisseur Dupont;;2 600,50"]);
    const id2 = (await imports.uploadImport(analyst, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy2025, periodEnd: "2025-12-31", dataStatus: "final", file: file("balance-v2.csv", v2),
    })).id;
    const err = await imports.commitImport(analyst, w.c.c1, id2, {}).catch((e) => e);
    expect(err).toMatchObject({ code: "confirm_supersede" });
    await imports.commitImport(analyst, w.c.c1, id2, { confirmSupersede: true });
    const rows = await sql`select source_import_id, is_current from app.trial_balances where company_id = ${w.c.c1} order by created_at`;
    expect(rows.map((r) => [r.source_import_id, r.is_current])).toEqual([[importId, false], [id2, true]]);
    expect((await sql`select status from app.import_files where id = ${importId}`)[0].status).toBe("superseded");
  });

  it("balance déséquilibrée : validation refusée, rien n'est enregistré", async () => {
    const id = (await imports.uploadImport(analyst, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy2025, periodEnd: "2025-06-30", dataStatus: "provisional",
      file: file("faux.csv", csv(["101000;Capital;;10 000,00", "512000;Banque;9 999,99;"])),
    })).id;
    const ws = await imports.getImportWorkspace(analyst, w.c.c1, id);
    expect(ws.prepared!.blocking).toBe(true);
    expect(ws.prepared!.issues.find((i) => i.code === "unbalanced")?.message).toMatch(/écart 0,01/);
    await expect(imports.commitImport(analyst, w.c.c1, id, {})).rejects.toMatchObject({ code: "blocking_errors" });
    expect(await sql`select 1 from app.trial_balances where source_import_id = ${id}`).toHaveLength(0);
    await imports.cancelImport(analyst, w.c.c1, id);
  });

  it("correspondance modifiée : enregistrée puis réutilisée comme modèle", async () => {
    const other = latin1(["Num;Lib;Solde", "411000;Clients;1 000,00", "706000;Ventes;-1 000,00"].join("\n"));
    const id = (await imports.uploadImport(analyst, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy2025, periodEnd: "2025-03-31", dataStatus: "provisional", file: file("signe.csv", other),
    })).id;
    await imports.saveMapping(analyst, w.c.c1, id, { headerRow: 0, amountMode: "signed", columns: { account_number: 0, account_label: 1, balance: 2 } });
    await imports.commitImport(analyst, w.c.c1, id, { saveTemplate: true });
    const again = latin1(["Num;Lib;Solde", "411000;Clients;2 000,00", "706000;Ventes;-2 000,00"].join("\n"));
    const id2 = (await imports.uploadImport(analyst, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy2025, periodEnd: "2025-04-30", dataStatus: "provisional", file: file("signe-avril.csv", again),
    })).id;
    const ws = await imports.getImportWorkspace(analyst, w.c.c1, id2);
    expect(ws.prepared!.mappingSource).toBe("template");
    expect(ws.prepared!.blocking).toBe(false);
  });
});

describe("Import d'un FEC", () => {
  const fec = (lines: string[]) => enc([FEC_HEAD, ...lines].join("\n"));
  const ok = fec([
    fecLine("1", "20250115", "411000", "Clients", "1200,00", "0,00"),
    fecLine("1", "20250115", "706000", "Ventes", "0,00", "1000,00"),
    fecLine("1", "20250115", "445710", "TVA collectée", "0,00", "200,00"),
  ]);
  let first: string;

  it("FEC conforme : écritures enregistrées avec leur ligne source", async () => {
    first = (await imports.uploadImport(analyst, w.c.c1, { kind: "fec", fiscalYearId: fy2025, file: file("FEC2025.txt", ok) })).id;
    const ws = await imports.getImportWorkspace(analyst, w.c.c1, first);
    expect(ws.prepared!.blocking).toBe(false);
    expect(ws.prepared!.issues.map((i) => i.code)).toContain("file_name");
    await imports.commitImport(analyst, w.c.c1, first, {});
    const rows = await sql`select account_number, debit, credit, entry_date::text, source_row from app.accounting_entries where import_file_id = ${first} order by source_row`;
    expect(rows.map((r) => [r.account_number, r.debit, r.credit, r.entry_date, r.source_row])).toEqual([
      ["411000", "1200.00", "0.00", "2025-01-15", 2], ["706000", "0.00", "1000.00", "2025-01-15", 3], ["445710", "0.00", "200.00", "2025-01-15", 4],
    ]);
  });

  it("un second FEC du même exercice remplace le premier après confirmation", async () => {
    const v2 = fec([fecLine("1", "20250115", "411000", "Clients", "600,00", "0,00"), fecLine("1", "20250115", "706000", "Ventes", "0,00", "600,00")]);
    const id = (await imports.uploadImport(analyst, w.c.c1, { kind: "fec", fiscalYearId: fy2025, file: file("FEC2025-v2.txt", v2) })).id;
    await expect(imports.commitImport(analyst, w.c.c1, id, {})).rejects.toMatchObject({ code: "confirm_supersede" });
    await imports.commitImport(analyst, w.c.c1, id, { confirmSupersede: true });
    const st = await sql`select id, status from app.import_files where id in (${first}, ${id}) order by created_at`;
    expect(st.map((s) => s.status)).toEqual(["superseded", "committed"]);
  });

  it("FEC déséquilibré ou hors exercice : refusé", async () => {
    // Écriture 9 déséquilibrée (dans l'exercice) ; écriture 10 datée hors exercice.
    const bad = fec([
      fecLine("9", "20250315", "411000", "Clients", "100,00", "0,00"), fecLine("9", "20250315", "706000", "Ventes", "0,00", "90,00"),
      fecLine("10", "20260115", "411000", "Clients", "10,00", "0,00"), fecLine("10", "20260115", "706000", "Ventes", "0,00", "10,00"),
    ]);
    const id = (await imports.uploadImport(analyst, w.c.c1, { kind: "fec", fiscalYearId: fy2025, file: file("FEC-faux.txt", bad) })).id;
    const ws = await imports.getImportWorkspace(analyst, w.c.c1, id);
    expect(ws.prepared!.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["unbalanced_entry", "out_of_fiscal_year"]));
    await expect(imports.commitImport(analyst, w.c.c1, id, {})).rejects.toMatchObject({ code: "blocking_errors" });
  });

  it("un fichier non FEC est refusé dès le téléversement s'il est illisible, sinon à l'analyse", async () => {
    const id = (await imports.uploadImport(analyst, w.c.c1, { kind: "fec", fiscalYearId: fy2025, file: file("pas-un-fec.txt", enc("a\tb\n1\t2")) })).id;
    const ws = await imports.getImportWorkspace(analyst, w.c.c1, id);
    expect(ws.prepared!.issues.map((i) => i.code)).toContain("not_fec");
    expect(ws.prepared!.blocking).toBe(true);
    const err = await imports.uploadImport(analyst, w.c.c1, { kind: "fec", fiscalYearId: fy2025, file: file("vide.txt", new Uint8Array()) }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
  });
});

describe("Import bancaire et doublons", () => {
  const releve = (rows: string[]) => enc(["Date;Libellé;Débit;Crédit", ...rows].join("\n"));
  it("réimport chevauchant : seules les nouvelles opérations sont enregistrées", async () => {
    const janv = releve(["02/01/2025;PRLV URSSAF;1 000,00;", "03/01/2025;VIR CLIENT A;;2 500,00", "03/01/2025;CB BOULANGERIE;4,50;", "03/01/2025;CB BOULANGERIE;4,50;"]);
    const id1 = (await imports.uploadImport(analyst, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("janvier.csv", janv) })).id;
    await imports.commitImport(analyst, w.c.c1, id1, {});
    expect((await sql`select count(*)::int as n from app.bank_transactions where bank_account_id = ${bankId}`)[0].n).toBe(4);

    const chevauchant = releve(["03/01/2025;VIR CLIENT A;;2 500,00", "03/01/2025;CB BOULANGERIE;4,50;", "03/01/2025;CB BOULANGERIE;4,50;", "03/01/2025;CB BOULANGERIE;4,50;", "05/01/2025;LOYER;800,00;"]);
    const id2 = (await imports.uploadImport(analyst, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("janvier-bis.csv", chevauchant) })).id;
    const ws = await imports.getImportWorkspace(analyst, w.c.c1, id2);
    expect(ws.prepared!.summary).toMatchObject({ Opérations: 5, Doublons: 3, "Nouvelles opérations": 2 });
    const { report } = await imports.commitImport(analyst, w.c.c1, id2, {});
    expect(report.counts).toMatchObject({ lignesEnregistrees: 2, doublons: 3 });
    const all = await sql`select amount, label_raw from app.bank_transactions where bank_account_id = ${bankId} order by booking_date, source_row`;
    expect(all.map((t) => t.amount).sort()).toEqual(["-1000.00", "-4.50", "-4.50", "-4.50", "-800.00", "2500.00"].sort());
    const dups = await sql`select count(*)::int as n from app.import_rows where import_file_id = ${id2} and status = 'duplicate'`;
    expect(dups[0].n).toBe(3);
    const overview = await imports.getDataOverview(analyst, w.c.c1);
    expect(overview.bankAccounts.find((b) => b.id === bankId)).toMatchObject({ transactionCount: 6, lastDate: "2025-01-05" });
  });
});

describe("Droits et isolation (Phase 2)", () => {
  it("un dirigeant ne peut ni importer ni consulter un import", async () => {
    await expect(
      imports.uploadImport(client1, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("x.csv", enc("Date;Libellé;Montant\n01/01/2025;X;1,00")) }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const [any] = await sql`select id from app.import_files where company_id = ${w.c.c1} limit 1`;
    await expect(imports.getImportWorkspace(client1, w.c.c1, any.id)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("RLS : le client lit les données normalisées de son entreprise, jamais la couche brute", async () => {
    expect(await asUser(sql, w.u.client1, (tx) => tx`select id from app.import_files`)).toHaveLength(0);
    expect(await asUser(sql, w.u.client1, (tx) => tx`select id from app.import_rows`)).toHaveLength(0);
    expect((await asUser(sql, w.u.client1, (tx) => tx`select id from app.trial_balances`)).length).toBeGreaterThan(0);
    expect(await asUser(sql, w.u.client2, (tx) => tx`select id from app.trial_balances where company_id = ${w.c.c1}`)).toHaveLength(0);
    expect(await asUser(sql, w.u.client2, (tx) => tx`select id from app.bank_transactions`)).toHaveLength(0);
    expect(await asUser(sql, w.u.admin2, (tx) => tx`select id from app.accounting_entries`)).toHaveLength(0);
  });

  it("un collaborateur non affecté ne voit pas les imports d'une autre entreprise du cabinet", async () => {
    await expect(imports.getDataOverview(analyst, w.c.c2)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await asUser(sql, w.u.analyst1, (tx) => tx`select id from app.import_files where company_id = ${w.c.c2}`)).toHaveLength(0);
  });

  it("intégrité : impossible de rattacher une donnée à la balance d'une autre entreprise", async () => {
    const [tb] = await sql`select id from app.trial_balances where company_id = ${w.c.c1} limit 1`;
    await expect(
      sql`insert into app.trial_balance_lines (trial_balance_id, company_id, account_number, closing_debit, closing_credit, source_row)
          values (${tb.id}, ${w.c.c2}, '606', 0, 0, 1)`,
    ).rejects.toThrow(/foreign key/);
  });

  it("les données importées ne sont ni modifiables ni supprimables par l'application", async () => {
    await expect(asUser(sql, w.u.admin1, (tx) => tx`update app.trial_balance_lines set closing_debit = 0`)).rejects.toThrow(/permission denied/);
    await expect(asUser(sql, w.u.admin1, (tx) => tx`delete from app.accounting_entries`)).rejects.toThrow(/permission denied/);
    await expect(asUser(sql, w.u.admin1, (tx) => tx`update app.bank_transactions set amount = 0`)).rejects.toThrow(/permission denied/);
  });
});

describe("Plan de comptes et disponibilité des sources", () => {
  it("rattachement manuel avec règle de préfixe appliquée aux autres comptes à vérifier", async () => {
    await sql`insert into app.chart_of_accounts (company_id, account_number, label, mapping_status) values (${w.c.c1}, 'FAUTRE', 'Autre', 'to_review')`;
    const r = await data.mapAccount(analyst, w.c.c1, { accountNumber: "FDIVERS", pcgAccount: "401", createRule: "prefix", rulePattern: "F" });
    expect(r.appliedToOthers).toBe(1);
    const rows = await sql`select account_number, pcg_account, mapping_status from app.chart_of_accounts where account_number in ('FDIVERS', 'FAUTRE') and company_id = ${w.c.c1} order by 1`;
    expect(rows.map((x) => [x.account_number, x.pcg_account, x.mapping_status])).toEqual([["FAUTRE", "401", "auto_validated"], ["FDIVERS", "401", "manual"]]);
    await expect(data.mapAccount(analyst, w.c.c1, { accountNumber: "FDIVERS", pcgAccount: "9999" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("sources disponibles : visibles par le dirigeant, aucune pour une autre entreprise", async () => {
    expect([...(await data.getAvailableSources(client1, w.c.c1))].sort()).toEqual(["bank_transactions", "fec", "trial_balance"]);
    const c2 = await data.getAvailableSources(staff(w.u.admin1, w.f1, "firm_admin"), w.c.c2);
    expect(c2.size).toBe(0);
  });
});
