// Suppression sécurisée d'un import enregistré : atomicité, isolation, historique, plan de comptes,
// stockage partagé, audit, réimport. Services réels, base réelle, stockage en mémoire.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import { MemoryStorage, setStorageForTests } from "@/lib/storage";
import type { Actor } from "@/services/actor";
import { asUser, createWorld, ownerSql, type World } from "./fixtures";

const sql = ownerSql();
const storage = new MemoryStorage();
let w: World;
let imports: typeof import("@/services/imports");
let deletion: typeof import("@/services/import-deletion");
let data: typeof import("@/services/company-data");
let admin: Actor;
let analyst: Actor;
let admin2: Actor;
let client1: Actor;
let fy: string;
let bankId: string;

const enc = (s: string) => new TextEncoder().encode(s);
const file = (name: string, text: string) => ({ name, type: "text/csv", bytes: enc(text) });
const staff = (userId: string, firmId: string, role: "firm_admin" | "firm_analyst", aal: "aal1" | "aal2" = "aal2"): Actor => ({
  userId, email: "s@test.invalid", fullName: "s", aal, hasVerifiedTotp: true, firms: [{ firmId, role, firmName: "C" }], clientCompanies: [],
});
const CONFIRM = { confirmation: "SUPPRIMER" };

/** Balance « 02_BALANCE_2025_valide.csv » : 8 comptes, équilibrée. */
const balance8 = (suffix = "") =>
  [
    "Compte;Intitulé;Solde débit;Solde crédit",
    "101000;Capital;;20 000,00", "164000;Emprunt;;5 000,00", "401000;Fournisseurs;;3 000,00",
    "411000;Clients;6 000,00;", "512000;Banque;14 000,00;", "606000;Achats;3 000,00;",
    "641000;Salaires;10 000,00;", `706000;Ventes${suffix};;5 000,00`,
  ].join("\n");

async function importBalance(name: string, text: string, periodEnd = "2025-12-31", opts: Record<string, unknown> = {}) {
  const { id } = await imports.uploadImport(admin, w.c.c1, { kind: "trial_balance", fiscalYearId: fy, periodEnd, dataStatus: "final", file: file(name, text) });
  await imports.commitImport(admin, w.c.c1, id, opts);
  return id;
}

const count = async (q: PromiseLike<readonly Record<string, unknown>[]>) => Number((await q)[0]?.n);

beforeAll(async () => {
  setStorageForTests(storage);
  w = await createWorld(sql);
  imports = await import("@/services/imports");
  deletion = await import("@/services/import-deletion");
  data = await import("@/services/company-data");
  admin = staff(w.u.admin1, w.f1, "firm_admin");
  analyst = staff(w.u.analyst1, w.f1, "firm_analyst");
  admin2 = staff(w.u.admin2, w.f2, "firm_admin");
  client1 = {
    userId: w.u.client1, email: "c@test.invalid", fullName: "c", aal: "aal1", hasVerifiedTotp: false, firms: [],
    clientCompanies: [{ companyId: w.c.c1, role: "client_owner", companyName: "C1", tradeName: null }],
  };
  fy = (await data.createFiscalYear(admin, w.c.c1, { startDate: "2025-01-01", endDate: "2025-12-31" })).id;
  bankId = (await data.createBankAccount(admin, w.c.c1, { bankName: "B", label: "Courant", ibanLast4: "" })).id;
});
afterAll(async () => {
  setStorageForTests(null);
  await sql.end();
});

describe("Annulation (import non enregistré)", () => {
  it("un import en attente s'annule ; il ne peut pas être « supprimé définitivement »", async () => {
    const { id } = await imports.uploadImport(admin, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy, periodEnd: "2025-01-31", dataStatus: "provisional", file: file("attente.csv", balance8(" ")),
    });
    const plan = await deletion.getDeletionPreview(admin, w.c.c1, id);
    expect(plan.blockers[0]).toMatch(/Annuler l'import/);
    await expect(deletion.deleteImport(admin, w.c.c1, id, CONFIRM)).rejects.toBeInstanceOf(BusinessRuleError);
    await imports.cancelImport(admin, w.c.c1, id);
    expect((await sql`select status from app.import_files where id = ${id}`)[0].status).toBe("cancelled");
  });
});

describe("Cas réel : 02_BALANCE_2025_valide.csv (8 lignes, 8 comptes, clé de stockage partagée)", () => {
  let id: string;
  let storageKey: string;
  let legacyTwin: string;

  it("préparation : balance enregistrée + second enregistrement partageant la même clé (ancien format)", async () => {
    id = await importBalance("02_BALANCE_2025_valide.csv", balance8());
    [{ storage_key: storageKey }] = await sql`select storage_key from app.import_files where id = ${id}`;
    // Ancien schéma de clés (« entreprise/imports/empreinte ») : un import annulé du même fichier.
    [{ id: legacyTwin }] = await sql`
      insert into app.import_files (company_id, kind, status, original_name, size_bytes, sha256, storage_key, fiscal_year_id, period_end, data_status, created_by)
      select company_id, kind, 'cancelled', original_name, size_bytes, sha256, storage_key, fiscal_year_id, period_end, data_status, created_by
      from app.import_files where id = ${id} returning id`;
    const plan = await deletion.getDeletionPreview(admin, w.c.c1, id);
    expect(plan.counts).toMatchObject({ trialBalances: 1, trialBalanceLines: 8 });
    expect(plan.versions).toMatchObject({ isCurrent: true, previous: null, newer: null });
    expect(plan.accounts).toEqual({ reassigned: 0, keptManual: 0, deleted: 8 });
    expect(plan.storage.sharedWith).toBe(1);
    expect(plan.blockers).toEqual([]);
    expect(plan.canDelete).toBe(true);
  });

  it("confirmation obligatoire : « SUPPRIMER »", async () => {
    await expect(deletion.deleteImport(admin, w.c.c1, id, { confirmation: "supprimer" })).rejects.toBeInstanceOf(ValidationError);
    await expect(deletion.deleteImport(admin, w.c.c1, id, {})).rejects.toBeInstanceOf(ValidationError);
    expect(await count(sql`select count(*) as n from app.trial_balance_lines where company_id = ${w.c.c1}`)).toBe(8);
  });

  it("suppression : balance, lignes, comptes, import ; fichier partagé conservé ; audit ; version des données", async () => {
    const before = Number((await sql`select data_version from app.companies where id = ${w.c.c1}`)[0].data_version);
    const out = await deletion.deleteImport(admin, w.c.c1, id, CONFIRM);
    expect(out).toMatchObject({ trialBalanceLines: 8, accountsDeleted: 8, storageCleanupId: null, fileName: "02_BALANCE_2025_valide.csv" });
    expect(await count(sql`select count(*) as n from app.import_files where id = ${id}`)).toBe(0);
    expect(await count(sql`select count(*) as n from app.trial_balances where source_import_id = ${id}`)).toBe(0);
    expect(await count(sql`select count(*) as n from app.chart_of_accounts where company_id = ${w.c.c1}`)).toBe(0);
    // Le fichier reste stocké : l'autre enregistrement l'utilise encore.
    expect(storage.objects.has(storageKey)).toBe(true);
    expect(await count(sql`select count(*) as n from app.import_files where id = ${legacyTwin}`)).toBe(1);
    expect(Number((await sql`select data_version from app.companies where id = ${w.c.c1}`)[0].data_version)).toBe(before + 1);
    const [audit] = await sql`select * from app.audit_log where action = 'import.delete' and object_id = ${id}`;
    expect(audit).toMatchObject({ actor_user_id: w.u.admin1, company_id: w.c.c1, outcome: "success" });
    expect(audit.details).toMatchObject({ kind: "trial_balance", fileName: "02_BALANCE_2025_valide.csv", storage: "shared", deleted: { trialBalanceLines: 8 } });
    expect(JSON.stringify(audit.details)).not.toMatch(/20000|14000/); // aucun montant dans le journal
  });

  it("disponibilité des sources : plus de balance ⇒ « Données insuffisantes » côté dirigeant", async () => {
    expect((await data.getAvailableSources(client1, w.c.c1)).has("trial_balance")).toBe(false);
  });

  it("le fichier supprimé peut être réimporté (pas de faux doublon)", async () => {
    const again = await importBalance("02_BALANCE_2025_valide.csv", balance8());
    expect((await sql`select status from app.import_files where id = ${again}`)[0].status).toBe("committed");
    expect((await data.getAvailableSources(client1, w.c.c1)).has("trial_balance")).toBe(true);
    await deletion.deleteImport(admin, w.c.c1, again, CONFIRM);
  });
});

describe("Historique des versions", () => {
  it("version intermédiaire supprimée : la chaîne est recousue ; la version courante est intacte", async () => {
    const v1 = await importBalance("v1.csv", balance8(" v1"), "2025-06-30");
    const v2 = await importBalance("v2.csv", balance8(" v2"), "2025-06-30", { confirmSupersede: true });
    const v3 = await importBalance("v3.csv", balance8(" v3"), "2025-06-30", { confirmSupersede: true });
    const plan = await deletion.getDeletionPreview(admin, w.c.c1, v2);
    expect(plan.versions).toMatchObject({ isCurrent: false, previous: { fileName: "v1.csv" }, newer: { fileName: "v3.csv" } });
    await deletion.deleteImport(admin, w.c.c1, v2, CONFIRM);
    const [b3] = await sql`select b.is_current, p.source_import_id as prev from app.trial_balances b left join app.trial_balances p on p.id = b.supersedes_id where b.source_import_id = ${v3}`;
    expect(b3).toMatchObject({ is_current: true, prev: v1 });

    // Version courante supprimée SANS réactivation : plus aucune balance courante à cette date.
    await deletion.deleteImport(admin, w.c.c1, v3, CONFIRM);
    expect(await count(sql`select count(*) as n from app.trial_balances where company_id = ${w.c.c1} and period_end = '2025-06-30' and is_current`)).toBe(0);
    expect((await sql`select status from app.import_files where id = ${v1}`)[0].status).toBe("superseded");
    await deletion.deleteImport(admin, w.c.c1, v1, CONFIRM);
  });

  it("version courante supprimée AVEC réactivation explicite de la précédente", async () => {
    const v1 = await importBalance("r1.csv", balance8(" r1"), "2025-03-31");
    const v2 = await importBalance("r2.csv", balance8(" r2"), "2025-03-31", { confirmSupersede: true });
    const out = await deletion.deleteImport(admin, w.c.c1, v2, { ...CONFIRM, reactivatePrevious: true });
    expect(out.reactivatedImportId).toBe(v1);
    const [b1] = await sql`select is_current from app.trial_balances where source_import_id = ${v1}`;
    expect(b1.is_current).toBe(true);
    expect((await sql`select status from app.import_files where id = ${v1}`)[0].status).toBe("committed");
    await deletion.deleteImport(admin, w.c.c1, v1, CONFIRM);
  });
});

describe("FEC et plan de comptes", () => {
  const H = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
  const l = (n: string, acc: string, d: string, c: string) => ["VT", "Ventes", n, "20250115", acc, `Lib ${acc}`, "", "", "P", "20250115", "Vente", d, c, "", "", "20250131", "", ""].join("\t");

  it("FEC supprimé : écritures supprimées ; comptes encore utilisés rattachés ailleurs ; rattachement manuel conservé", async () => {
    const fec = (await imports.uploadImport(admin, w.c.c1, { kind: "fec", fiscalYearId: fy, file: file("FEC.txt", [H, l("1", "411000", "120,00", ""), l("1", "706000", "", "100,00"), l("1", "XVENTE", "", "20,00")].join("\n")) })).id;
    await imports.commitImport(admin, w.c.c1, fec, {});
    // Correction manuelle du compte alphanumérique + règle mémorisée.
    await data.mapAccount(admin, w.c.c1, { accountNumber: "XVENTE", pcgAccount: "445710", createRule: "exact" });
    // Une balance postérieure utilise aussi 411000.
    const tb = await importBalance("tb-411.csv", "Compte;Intitulé;Solde débit;Solde crédit\n411000;Clients;50,00;\n706000;Ventes;;50,00", "2025-09-30");
    const plan = await deletion.getDeletionPreview(admin, w.c.c1, fec);
    expect(plan.counts.accountingEntries).toBe(3);
    expect(plan.accounts).toEqual({ reassigned: 2, keptManual: 1, deleted: 0 });

    const out = await deletion.deleteImport(admin, w.c.c1, fec, CONFIRM);
    expect(out).toMatchObject({ accountingEntries: 3, accountsReassigned: 2, accountsKeptManual: 1, accountsDeleted: 0 });
    const accs = await sql`select account_number, first_seen_import_id, mapping_status, pcg_account from app.chart_of_accounts where company_id = ${w.c.c1} order by 1`;
    expect(accs.map((a) => [a.account_number, a.first_seen_import_id, a.mapping_status, a.pcg_account])).toEqual([
      ["411000", tb, "auto_validated", "411"], ["706000", tb, "auto_validated", "706"], ["XVENTE", null, "manual", "445710"],
    ]);
    expect(await count(sql`select count(*) as n from app.account_mapping_rules where company_id = ${w.c.c1} and pattern = 'XVENTE'`)).toBe(1);
    expect((await data.getAvailableSources(admin, w.c.c1)).has("fec")).toBe(false);
    await deletion.deleteImport(admin, w.c.c1, tb, CONFIRM);
  });
});

describe("Relevés bancaires", () => {
  const releve = (rows: string[]) => ["Date;Libellé;Débit;Crédit", ...rows].join("\n");

  it("opérations supprimées puis réimportables ; sens enregistré", async () => {
    const text = releve(["02/01/2025;PRLV URSSAF;1 000,00;", "03/01/2025;VIR CLIENT;;2 500,00", "04/01/2025;REGUL;;-5,00"]);
    const id = (await imports.uploadImport(admin, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("banque.csv", text) })).id;
    await imports.commitImport(admin, w.c.c1, id, {});
    const dirs = await sql`select amount, flow_direction, review_reason from app.bank_transactions where source_import_id = ${id} order by source_row`;
    expect(dirs.map((d) => [d.amount, d.flow_direction])).toEqual([["-1000.00", "outflow"], ["2500.00", "inflow"], ["5.00", "to_review"]]);
    expect(dirs[2].review_reason).toMatch(/négatif dans la colonne Crédit/);
    // Aucune catégorie n'est inventée.
    expect(await count(sql`select count(*) as n from app.bank_transactions where source_import_id = ${id} and category_code is not null`)).toBe(0);

    const out = await deletion.deleteImport(admin, w.c.c1, id, CONFIRM);
    expect(out.bankTransactions).toBe(3);
    expect(out.storageCleanupId).not.toBeNull();
    expect(out.storage.removed).toBe(1);
    // Réimport du même fichier : les empreintes ont été libérées, les opérations reviennent.
    const again = (await imports.uploadImport(admin, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("banque.csv", text) })).id;
    const { report } = await imports.commitImport(admin, w.c.c1, again, {});
    expect(report.counts.lignesEnregistrees).toBe(3);
  });

  it("suppression bloquée si un import plus récent s'appuie sur ces opérations (doublons ignorés)", async () => {
    const [{ id: first }] = await sql`select id from app.import_files where company_id = ${w.c.c1} and kind = 'bank_transactions' and status = 'committed'`;
    const later = (await imports.uploadImport(admin, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("banque-2.csv", releve(["03/01/2025;VIR CLIENT;;2 500,00", "10/01/2025;LOYER;800,00;"])) })).id;
    await imports.commitImport(admin, w.c.c1, later, {});
    const plan = await deletion.getDeletionPreview(admin, w.c.c1, first);
    expect(plan.blockers[0]).toMatch(/banque-2\.csv/);
    await expect(deletion.deleteImport(admin, w.c.c1, first, CONFIRM)).rejects.toMatchObject({ code: "deletion_blocked" });
    // Ordre inverse : autorisé.
    await deletion.deleteImport(admin, w.c.c1, later, CONFIRM);
    await deletion.deleteImport(admin, w.c.c1, first, CONFIRM);
    expect(await count(sql`select count(*) as n from app.bank_transactions where bank_account_id = ${bankId}`)).toBe(0);
  });

  it("échec du stockage : données SQL supprimées, fichier mis en file et repris plus tard", async () => {
    const id = (await imports.uploadImport(admin, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("panne.csv", releve(["05/02/2025;CB;12,00;"])) })).id;
    await imports.commitImport(admin, w.c.c1, id, {});
    const [{ storage_key: key }] = await sql`select storage_key from app.import_files where id = ${id}`;
    storage.failDeletes.add(key);
    const out = await deletion.deleteImport(admin, w.c.c1, id, CONFIRM);
    expect(out.storage).toEqual({ removed: 0, pending: 1, skipped: 0 });
    const [job] = await sql`select status, attempts, last_error from app.storage_cleanup_queue where storage_key = ${key}`;
    expect(job).toMatchObject({ status: "pending", attempts: 1 });
    expect(await count(sql`select count(*) as n from app.audit_log where action = 'storage.cleanup' and outcome = 'failure' and company_id = ${w.c.c1}`)).toBe(1);
    expect(await deletion.countPendingStorageCleanups(admin, w.c.c1)).toBe(1);
    storage.failDeletes.delete(key);
    expect(await deletion.processStorageCleanup(admin, w.c.c1)).toEqual({ removed: 1, pending: 0, skipped: 0 });
    expect(storage.objects.has(key)).toBe(false);
  });
});

describe("Atomicité", () => {
  it("échec au milieu de la suppression : rien n'est supprimé", async () => {
    const id = await importBalance("atomique.csv", balance8(" a"), "2025-04-30");
    await sql.unsafe(`
      create function app.test_fail_delete() returns trigger language plpgsql as $$
      begin raise exception 'panne simulée'; end $$;
      create trigger test_fail_delete before delete on app.import_files for each row execute function app.test_fail_delete();`);
    try {
      await expect(deletion.deleteImport(admin, w.c.c1, id, CONFIRM)).rejects.toThrow();
    } finally {
      await sql.unsafe(`drop trigger test_fail_delete on app.import_files; drop function app.test_fail_delete();`);
    }
    // Les étapes déjà exécutées (comptes, lignes, balance) ont été annulées.
    expect(await count(sql`select count(*) as n from app.trial_balance_lines l join app.trial_balances b on b.id = l.trial_balance_id where b.source_import_id = ${id}`)).toBe(8);
    expect(await count(sql`select count(*) as n from app.chart_of_accounts where company_id = ${w.c.c1} and first_seen_import_id = ${id}`)).toBeGreaterThan(0);
    expect(await count(sql`select count(*) as n from app.storage_cleanup_queue where import_file_id = ${id}`)).toBe(0);
    expect(await count(sql`select count(*) as n from app.audit_log where action = 'import.delete' and object_id = ${id}`)).toBe(0);
    await deletion.deleteImport(admin, w.c.c1, id, CONFIRM);
  });

  it("transaction appelante annulée : la suppression est annulée aussi", async () => {
    const id = await importBalance("rollback.csv", balance8(" b"), "2025-05-31");
    await expect(
      asUser(sql, w.u.admin1, async (tx) => {
        await tx`select app.delete_import(${w.c.c1}::uuid, ${id}::uuid, false)`;
        throw new Error("interruption");
      }),
    ).rejects.toThrow("interruption");
    expect(await count(sql`select count(*) as n from app.import_files where id = ${id}`)).toBe(1);
    await deletion.deleteImport(admin, w.c.c1, id, CONFIRM);
  });
});

describe("Autorisations", () => {
  let id: string;
  beforeAll(async () => {
    id = await importBalance("droits.csv", balance8(" d"), "2025-07-31");
  });

  it("collaborateur DAF, dirigeant, admin d'un autre cabinet, admin sans 2FA : refusés (et journalisés)", async () => {
    await expect(deletion.deleteImport(analyst, w.c.c1, id, CONFIRM)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(deletion.deleteImport(client1, w.c.c1, id, CONFIRM)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(deletion.deleteImport(admin2, w.c.c1, id, CONFIRM)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(deletion.deleteImport(staff(w.u.admin1, w.f1, "firm_admin", "aal1"), w.c.c1, id, CONFIRM)).rejects.toBeInstanceOf(AccessDeniedError);
    expect((await deletion.getDeletionPreview(analyst, w.c.c1, id)).canDelete).toBe(false);
    await expect(deletion.getDeletionPreview(client1, w.c.c1, id)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await count(sql`select count(*) as n from app.audit_log where outcome = 'denied' and action = 'imports.admin' and company_id = ${w.c.c1}`)).toBeGreaterThanOrEqual(3);
  });

  it("en SQL direct : la fonction refuse tout sauf l'admin du cabinet ; aucun DELETE sur les tables", async () => {
    for (const u of [w.u.analyst1, w.u.client1, w.u.admin2]) {
      await expect(asUser(sql, u, (tx) => tx`select app.delete_import(${w.c.c1}::uuid, ${id}::uuid, false)`)).rejects.toThrow(/import_deletion_forbidden/);
    }
    for (const t of ["trial_balance_lines", "trial_balances", "import_files", "accounting_entries", "bank_transactions", "import_rows"]) {
      await expect(asUser(sql, w.u.admin1, (tx) => tx.unsafe(`delete from app.${t}`))).rejects.toThrow(/permission denied/);
    }
    // L'admin d'un cabinet ne peut viser un import d'une autre entreprise en usurpant l'identifiant.
    await expect(asUser(sql, w.u.admin2, (tx) => tx`select app.delete_import(${w.c.c3}::uuid, ${id}::uuid, false)`)).rejects.toThrow(/import_not_found/);
    expect(await count(sql`select count(*) as n from app.import_files where id = ${id}`)).toBe(1);
  });

  it("les autres entreprises et imports ne sont pas touchés", async () => {
    // Entreprise C2 : données propres, conservées après toutes les suppressions de C1.
    const fy2 = (await data.createFiscalYear(admin, w.c.c2, { startDate: "2025-01-01", endDate: "2025-12-31" })).id;
    const { id: other } = await imports.uploadImport(admin, w.c.c2, { kind: "trial_balance", fiscalYearId: fy2, periodEnd: "2025-12-31", dataStatus: "final", file: file("c2.csv", balance8()) });
    await imports.commitImport(admin, w.c.c2, other, {});
    await deletion.deleteImport(admin, w.c.c1, id, CONFIRM);
    expect(await count(sql`select count(*) as n from app.trial_balance_lines where company_id = ${w.c.c2}`)).toBe(8);
    expect(await count(sql`select count(*) as n from app.chart_of_accounts where company_id = ${w.c.c2}`)).toBe(8);
  });

  it("le journal d'audit reste non modifiable", async () => {
    await expect(sql`delete from app.audit_log where action = 'import.delete'`).rejects.toThrow(/ajout seul/);
  });
});

describe("Correspondances mémorisées et données déjà connues", () => {
  it("le modèle mémorisé survit à la suppression et se réapplique ; un modèle incompatible n'est jamais réutilisé en silence", async () => {
    const text = "Num;Lib;Solde\n411000;Clients;1 000,00\n706000;Ventes;-1 000,00";
    const { id } = await imports.uploadImport(admin, w.c.c1, { kind: "trial_balance", fiscalYearId: fy, periodEnd: "2025-08-31", dataStatus: "provisional", file: file("modele.csv", text) });
    await imports.saveMapping(admin, w.c.c1, id, { headerRow: 0, amountMode: "signed", columns: { account_number: 0, account_label: 1, balance: 2 } });
    await imports.commitImport(admin, w.c.c1, id, { saveTemplate: true });
    await deletion.deleteImport(admin, w.c.c1, id, CONFIRM);
    expect(await count(sql`select count(*) as n from app.column_mapping_templates where company_id = ${w.c.c1} and header_signature = 'num|lib|solde'`)).toBe(1);

    // Même format, avec deux lignes de titre en plus : le modèle s'applique sur la ligne d'en-tête détectée.
    const { id: again } = await imports.uploadImport(admin, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy, periodEnd: "2025-08-31", dataStatus: "provisional",
      file: file("modele-titre.csv", `Balance au 31/08/2025\n\n${text.replace("1 000,00", "2 000,00").replace("-1 000,00", "-2 000,00")}`),
    });
    const ws = await imports.getImportWorkspace(admin, w.c.c1, again);
    expect(ws.prepared!.mappingSource).toBe("template");
    expect(ws.prepared!.mapping).toMatchObject({ headerRow: 2, amountMode: "signed" });
    expect(ws.prepared!.blocking).toBe(false);
    await imports.cancelImport(admin, w.c.c1, again);

    // Modèle devenu incompatible (colonne inexistante) : correspondance reproposée + avertissement.
    await sql`update app.column_mapping_templates set mapping = jsonb_set(mapping, '{columns,balance}', '9') where company_id = ${w.c.c1} and header_signature = 'num|lib|solde'`;
    const { id: third } = await imports.uploadImport(admin, w.c.c1, {
      kind: "trial_balance", fiscalYearId: fy, periodEnd: "2025-08-31", dataStatus: "provisional",
      file: file("modele-3.csv", text.replace("1 000,00", "3 000,00").replace("-1 000,00", "-3 000,00")),
    });
    const ws3 = await imports.getImportWorkspace(admin, w.c.c1, third);
    expect(ws3.prepared!.mappingSource).toBe("suggested");
    expect(ws3.prepared!.issues.map((i) => i.code)).toContain("template_incompatible");
    await imports.cancelImport(admin, w.c.c1, third);
  });

  it("opérations déjà connues absentes d'un nouveau relevé : signalées, jamais supprimées", async () => {
    const r1 = (await imports.uploadImport(admin, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("mars.csv", "Date;Libellé;Montant\n02/03/2025;A;-10,00\n03/03/2025;B;20,00\n04/03/2025;C;-30,00") })).id;
    await imports.commitImport(admin, w.c.c1, r1, {});
    const r2 = (await imports.uploadImport(admin, w.c.c1, { kind: "bank_transactions", bankAccountId: bankId, file: file("mars-corrige.csv", "Date;Libellé;Montant\n02/03/2025;A;-10,00\n04/03/2025;C;-30,00") })).id;
    const ws = await imports.getImportWorkspace(admin, w.c.c1, r2);
    const missing = ws.prepared!.issues.find((i) => i.code === "missing_known");
    expect(missing?.message).toMatch(/^1 opération/);
    await imports.cancelImport(admin, w.c.c1, r2);
    expect(await count(sql`select count(*) as n from app.bank_transactions where source_import_id = ${r1}`)).toBe(3);
    await deletion.deleteImport(admin, w.c.c1, r1, CONFIRM);
  });
});
