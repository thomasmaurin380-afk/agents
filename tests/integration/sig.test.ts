// Phase 3 — SIG : jeu AZUR CONSEIL SA (fichiers reconstitués, voir scripts/demo/generate-azur.ts),
// choix de la source, exceptions, cycle provisoire → validé → publié, obsolescence, isolation.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import { MemoryStorage, setStorageForTests } from "@/lib/storage";
import type { Actor } from "@/services/actor";
import { asUser, createWorld, ownerSql, type World } from "./fixtures";

const sql = ownerSql();
let w: World;
let imports: typeof import("@/services/imports");
let data: typeof import("@/services/company-data");
let sig: typeof import("@/services/sig");
let admin: Actor;
let analyst: Actor;
let admin2: Actor;
let client1: Actor;
let client2: Actor;
let fy: string;

const azur = (name: string) => ({ name, type: "text/plain", bytes: new Uint8Array(readFileSync(`demo-files/azur-conseil/${name}`)) });
const staff = (userId: string, firmId: string, role: "firm_admin" | "firm_analyst"): Actor => ({
  userId, email: "s@test.invalid", fullName: role, aal: "aal2", hasVerifiedTotp: true, firms: [{ firmId, role, firmName: "C" }], clientCompanies: [],
});
const client = (userId: string, companyId: string): Actor => ({
  userId, email: "c@test.invalid", fullName: "c", aal: "aal1", hasVerifiedTotp: false, firms: [],
  clientCompanies: [{ companyId, role: "client_owner", companyName: "C", tradeName: null }],
});

type Computed = Extract<NonNullable<Awaited<ReturnType<typeof sig.getSigWorkspace>>["report"]>, { status: "computed" }>;
async function report(actor: Actor, params: Record<string, unknown> = {}): Promise<Computed> {
  const ws = await sig.getSigWorkspace(actor, w.c.c1, { fiscalYearId: fy, ...params });
  if (ws.report?.status !== "computed") throw new Error(`Calcul impossible : ${ws.report && "reason" in ws.report ? ws.report.reason : "aucun"}`);
  return ws.report as Computed;
}
const row = (r: Computed, code: string) => r.content.rows.find((x) => x.code === code)!;
const codes = (r: Computed) => r.content.checks.map((c) => `${c.code}:${c.severity}`);

beforeAll(async () => {
  setStorageForTests(new MemoryStorage());
  w = await createWorld(sql);
  imports = await import("@/services/imports");
  data = await import("@/services/company-data");
  sig = await import("@/services/sig");
  admin = staff(w.u.admin1, w.f1, "firm_admin");
  analyst = staff(w.u.analyst1, w.f1, "firm_analyst");
  admin2 = staff(w.u.admin2, w.f2, "firm_admin");
  client1 = client(w.u.client1, w.c.c1);
  client2 = client(w.u.client2, w.c.c2);
  fy = (await data.createFiscalYear(admin, w.c.c1, { startDate: "2025-01-01", endDate: "2025-12-31" })).id;
});
afterAll(async () => {
  setStorageForTests(null);
  await sql.end();
});

describe("AZUR CONSEIL SA — exercice 2025", () => {
  it("sans source : « Données insuffisantes », aucun chiffre", async () => {
    const ws = await sig.getSigWorkspace(admin, w.c.c1, { fiscalYearId: fy });
    expect(ws.report).toMatchObject({ status: "insufficient" });
  });

  it("balance seule : résultat net 12 354,00 €, rapprochement 0,00 €", async () => {
    const { id } = await imports.uploadImport(admin, w.c.c1, { kind: "trial_balance", fiscalYearId: fy, periodEnd: "2025-12-31", dataStatus: "final", file: azur("02_BALANCE_2025_valide.csv") });
    await imports.commitImport(admin, w.c.c1, id, {});
    const r = await report(admin);
    expect(r.decision).toMatchObject({ kind: "trial_balance", choice: "auto", compareWith: null });
    expect(row(r, "RESULTAT_NET").value).toBe("12354.00");
    expect(row(r, "PRODUCTION_VENDUE").value).toBe("17850.00");
    expect(row(r, "AUTRES_ACHATS_CHARGES_EXTERNES").value).toBe("5496.00");
    expect(row(r, "VALEUR_AJOUTEE").value).toBe("12354.00");
    expect(row(r, "EBE").value).toBe("12354.00");
    expect(r.content.reconciliation).toEqual({ sigResult: "12354.00", accountingResult: "12354.00", gap: "0.00" });
    expect(r.blocking).toBe(false);
    expect(row(r, "PRODUCTION_VENDUE").contributions[0]).toMatchObject({ account: "706000", amount: "17850.00", importId: id, rows: [5] });
  });

  it("balance + FEC concordants : contrôle croisé sans écart, même résultat avec le FEC choisi explicitement", async () => {
    const { id } = await imports.uploadImport(admin, w.c.c1, { kind: "fec", fiscalYearId: fy, file: azur("01_FEC_2025_valide.txt") });
    await imports.commitImport(admin, w.c.c1, id, {});
    const [{ n, d }] = await sql`select count(*)::int as n, sum(debit)::text as d from app.accounting_entries where import_file_id = ${id}`;
    expect([n, d]).toEqual([116, "60931.60"]);
    const auto = await report(admin);
    expect(auto.decision).toMatchObject({ kind: "trial_balance", compareWith: "fec" });
    expect(codes(auto)).not.toContain("sources_diverge:blocking");
    await expect(sig.getSigWorkspace(admin, w.c.c1, { fiscalYearId: fy, source: "fec" })).resolves.toMatchObject({ report: { status: "insufficient" } });
    const viaFec = await report(admin, { source: "fec", justification: "Contrôle sur le FEC" });
    expect(viaFec.decision).toMatchObject({ kind: "fec", choice: "explicit" });
    expect(row(viaFec, "RESULTAT_NET").value).toBe("12354.00");
    expect(row(viaFec, "PRODUCTION_VENDUE").contributions[0]).toMatchObject({ account: "706000", entries: 12 });
  });

  it("le relevé bancaire n'influence aucun SIG", async () => {
    const before = await report(admin);
    const bank = await data.createBankAccount(admin, w.c.c1, { bankName: "B", label: "Courant", ibanLast4: "" });
    const { id } = await imports.uploadImport(admin, w.c.c1, { kind: "bank_transactions", bankAccountId: bank.id, file: azur("03_BANQUE_2025_valide.csv") });
    await imports.commitImport(admin, w.c.c1, id, {});
    const [{ n, net }] = await sql`select count(*)::int as n, sum(amount)::text as net from app.bank_transactions where source_import_id = ${id}`;
    expect([n, net]).toEqual([21, "10983.60"]);
    const after = await report(admin);
    expect(after.contentHash).toBe(before.contentHash);
  });

  it("mois isolé sans balance mensuelle : FEC (seule source couvrant la période)", async () => {
    const r = await report(admin, { period: "month", month: 3 });
    expect(r.decision.kind).toBe("fec");
    expect(row(r, "PRODUCTION_VENDUE").value).toBe("1487.50");
    expect(row(r, "RESULTAT_NET").value).toBe("1029.50");
    const ytd = await report(admin, { period: "ytd", month: 6 });
    expect(row(ytd, "RESULTAT_NET").value).toBe("6177.00");
  });
});

describe("Cycle provisoire → validé → publié", () => {
  let snapshotId: string;

  it("le collaborateur valide ; une empreinte périmée est refusée", async () => {
    const r = await report(analyst);
    await expect(sig.validateSig(analyst, w.c.c1, { fiscalYearId: fy }, "0".repeat(64))).rejects.toMatchObject({ code: "sig_changed" });
    snapshotId = (await sig.validateSig(analyst, w.c.c1, { fiscalYearId: fy }, r.contentHash)).id;
    const s = await sig.getSnapshot(admin, w.c.c1, snapshotId);
    expect(s.snapshot).toMatchObject({ status: "validated", obsolete: false });
    expect(s.integrity).toBe(true);
  });

  it("le client ne voit rien tant que ce n'est pas publié (service et RLS)", async () => {
    expect((await sig.getPublishedSig(client1, w.c.c1)).published).toEqual([]);
    await expect(sig.getSnapshot(client1, w.c.c1, snapshotId)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(sig.getSigWorkspace(client1, w.c.c1, { fiscalYearId: fy })).rejects.toBeInstanceOf(AccessDeniedError);
    const n = await asUser(sql, w.u.client1, (tx) => tx`select count(*)::int as n from app.sig_snapshots`);
    expect(n[0].n).toBe(0);
  });

  it("publication : refusée au collaborateur, puis tant que le référentiel n'est pas validé par le cabinet", async () => {
    await expect(sig.publishSig(analyst, w.c.c1, snapshotId)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(sig.publishSig(admin, w.c.c1, snapshotId)).rejects.toMatchObject({ code: "sig_rules_not_approved" });
    await expect(sig.approveRuleSet(analyst, "PCG-2025")).rejects.toBeInstanceOf(AccessDeniedError);
    await sig.approveRuleSet(admin, "PCG-2025");
    await sig.publishSig(admin, w.c.c1, snapshotId);
    await expect(sig.publishSig(admin, w.c.c1, snapshotId)).rejects.toBeInstanceOf(BusinessRuleError);
    const audit = await sql`select action from app.audit_log where company_id = ${w.c.c1} and action like 'sig.%' and outcome = 'success' order by id`;
    expect(audit.map((a) => a.action)).toEqual(["sig.validate", "sig.publish"]);
  });

  it("le client voit la version publiée, sans détail interne ; les autres clients et cabinets rien", async () => {
    const pub = await sig.getPublishedSig(client1, w.c.c1);
    expect(pub.published.map((p) => p.id)).toEqual([snapshotId]);
    const s = await sig.getSnapshot(client1, w.c.c1, snapshotId);
    expect(s.content.rows.every((r) => r.contributions.length === 0)).toBe(true);
    expect(s.content.rows.map((r) => r.code)).toEqual([
      "CHIFFRE_AFFAIRES", "MARGE_COMMERCIALE", "PRODUCTION_EXERCICE", "VALEUR_AJOUTEE", "EBE",
      "RESULTAT_EXPLOITATION", "RESULTAT_COURANT_AVANT_IMPOTS", "RESULTAT_EXCEPTIONNEL", "RESULTAT_NET",
    ]);
    expect(s.content.rows.at(-1)!.value).toBe("12354.00");
    expect(s.content.source.refs).toEqual([]);
    await expect(sig.getSnapshot(client2, w.c.c1, snapshotId)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(sig.getSnapshot(admin2, w.c.c1, snapshotId)).rejects.toBeInstanceOf(AccessDeniedError);
    for (const u of [w.u.client2, w.u.admin2]) {
      const n = await asUser(sql, u, (tx) => tx`select count(*)::int as n from app.sig_snapshots`);
      expect(n[0].n).toBe(0);
    }
  });

  it("une version figée est immuable, même pour le propriétaire de la base", async () => {
    await expect(sql`update app.sig_snapshots set content = '{}'::jsonb where id = ${snapshotId}`).rejects.toThrow(/sig_snapshot_immutable/);
    await expect(sql`delete from app.sig_snapshots where id = ${snapshotId}`).rejects.toThrow(/sig_snapshot_immutable/);
    await expect(asUser(sql, w.u.admin1, (tx) => tx`update app.sig_snapshots set status = 'validated', published_at = null, published_by = null where id = ${snapshotId}`))
      .rejects.toThrow();
  });
});

describe("Exceptions de classement et obsolescence", () => {
  let pending: string;

  it("changement de rattachement PCG → compte à confirmer bloquant ; la version publiée devient obsolète", async () => {
    const r = await report(analyst, { period: "ytd", month: 6 });
    pending = (await sig.validateSig(analyst, w.c.c1, { fiscalYearId: fy, period: "ytd", month: 6 }, r.contentHash)).id;
    await data.mapAccount(admin, w.c.c1, { accountNumber: "615000", pcgAccount: "608", createRule: "none" });
    const after = await report(admin);
    expect(codes(after)).toContain("account_without_rubric:blocking");
    expect(after.content.reconciliation.gap).toBe("5496.00");
    expect(row(after, "RESULTAT_NET").value).toBe("17850.00");
    await expect(sig.validateSig(admin, w.c.c1, { fiscalYearId: fy }, after.contentHash)).rejects.toMatchObject({ code: "sig_blocking" });
    const pub = await sig.getPublishedSig(client1, w.c.c1);
    expect(pub.published[0].obsolete).toBe(true);
    await expect(sig.publishSig(admin, w.c.c1, pending)).rejects.toMatchObject({ code: "sig_obsolete" });
  });

  it("exception justifiée : réservée à l'administrateur, historisée, propre à l'entreprise", async () => {
    const input = { ruleSetCode: "PCG-2025", account: "615000", line: "AUTRES_ACHATS_CHARGES_EXTERNES", justification: "Frais accessoires de maintenance" };
    await expect(sig.setAccountOverride(analyst, w.c.c1, input)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(sig.setAccountOverride(admin, w.c.c1, { ...input, justification: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(sig.setAccountOverride(admin2, w.c.c1, input)).rejects.toBeInstanceOf(AccessDeniedError);
    await sig.setAccountOverride(admin, w.c.c1, { ...input, line: "ACHATS_MATIERES" });
    await sig.setAccountOverride(admin, w.c.c1, input);
    const r = await report(admin);
    expect(r.blocking).toBe(false);
    expect(row(r, "RESULTAT_NET").value).toBe("12354.00");
    expect(row(r, "AUTRES_ACHATS_CHARGES_EXTERNES").contributions[0].via).toBe("Exception : Frais accessoires de maintenance");
    expect(codes(r)).toContain("overrides_used:warning");
    const ws = await sig.getSigWorkspace(admin, w.c.c1, { fiscalYearId: fy });
    expect(ws.overrides.map((o) => [o.line, o.replacedAt === null])).toEqual([["AUTRES_ACHATS_CHARGES_EXTERNES", true], ["ACHATS_MATIERES", false]]);
    await expect(sql`delete from app.sig_account_overrides where company_id = ${w.c.c1}`).rejects.toThrow(/sig_override_immutable/);
    const n = await asUser(sql, w.u.client1, (tx) => tx`select count(*)::int as n from app.sig_account_overrides`);
    expect(n[0].n).toBe(0);
  });
});

describe("Exercice décalé, comparaison N / N-1 et changement de référentiel", () => {
  it("N-1 sous PCG 2024, N sous PCG 2025 : comparaison avec avertissement ; N-1 non classé → indisponible", async () => {
    const c = w.c.c2;
    const y1 = (await data.createFiscalYear(admin, c, { startDate: "2024-07-01", endDate: "2025-06-30" })).id;
    const y2 = (await data.createFiscalYear(admin, c, { startDate: "2025-07-01", endDate: "2026-06-30" })).id;
    const tb = (lines: string[]) => ({ name: "b.csv", type: "text/csv", bytes: new TextEncoder().encode(["Compte;Intitulé;Solde débit;Solde crédit", ...lines].join("\n")) });
    const load = async (fyId: string, end: string, lines: string[]) => {
      const { id } = await imports.uploadImport(admin, c, { kind: "trial_balance", fiscalYearId: fyId, periodEnd: end, dataStatus: "final", file: tb(lines) });
      await imports.commitImport(admin, c, id, {});
    };
    await load(y1, "2025-06-30", ["512000;Banque;3 000,00;", "707000;Ventes;;10 000,00", "607000;Achats;6 000,00;", "791000;Transferts;;1 000,00", "101000;Capital;2 000,00;"]);
    await load(y2, "2026-06-30", ["512000;Banque;3 500,00;", "707000;Ventes;;12 000,00", "607000;Achats;6 500,00;", "101000;Capital;2 000,00;"]);
    const ws = await sig.getSigWorkspace(admin, c, { fiscalYearId: y2 });
    const r = ws.report as Computed;
    expect(r.ruleSet.code).toBe("PCG-2025");
    expect(r.content.comparison).toMatchObject({ available: true, ruleSetCode: "PCG-2024" });
    expect(r.content.rows.find((x) => x.code === "MARGE_COMMERCIALE")).toMatchObject({ value: "5500.00", previous: "4000.00" });
    expect(r.content.rows.find((x) => x.code === "RESULTAT_NET")).toMatchObject({ value: "5500.00", previous: "5000.00" });
    expect(r.content.checks.map((x) => x.code)).toContain("rule_sets_differ");
    // Même mois relatif (octobre) dans les deux exercices : aucune balance mensuelle → indisponible.
    const m = await sig.getSigWorkspace(admin, c, { fiscalYearId: y2, period: "month", month: 4 });
    expect(m.report).toMatchObject({ status: "insufficient" });
    // Un compte N-1 sans rubrique rend la comparaison indisponible plutôt que fausse.
    await data.mapAccount(admin, c, { accountNumber: "791000", pcgAccount: "790", createRule: "none" });
    const again = (await sig.getSigWorkspace(admin, c, { fiscalYearId: y2 })).report as Computed;
    expect(again.content.comparison).toMatchObject({ available: false });
    expect(again.content.rows.find((x) => x.code === "RESULTAT_NET")!.previous).toBeNull();
    expect(again.content.checks.find((x) => x.code === "no_previous")!.title).toBe("Données N-1 indisponibles");
  });
});
