import { describe, expect, it } from "vitest";
import { buildChecks, type CheckContext } from "@/domain/sig/checks";
import { computeSig, type SigComputation } from "@/domain/sig/compute";
import { resolvePeriod } from "@/domain/sig/periods";
import { matchRule, RULE_SETS } from "@/domain/sig/rules";
import type { AccountBalance, LineCode, Override, RowCode } from "@/domain/sig/types";

/**
 * Corrections ciblées du référentiel (648, 649, 708/7098, 741/742/747, 672/772, 687/787).
 * Valeurs attendues calculées à la main, en euros, puis converties en centimes.
 */
const PCG24 = RULE_SETS["PCG-2024"];
const PCG25 = RULE_SETS["PCG-2025"];
const e = (euros: number) => BigInt(Math.round(euros * 100));

function bal(account: string, debit: number, credit: number): AccountBalance {
  const pcg = account.replace(/0+$/, "").padEnd(3, "0");
  return { account, label: account, pcgAccount: pcg, net: e(debit) - e(credit), debit: e(debit), credit: e(credit), origin: { importId: "i", fileName: "f", rows: [1] } };
}
const ov = (account: string, line: LineCode): Override => ({ id: `ov-${account}`, account, line, justification: "Décision du DAF" });
const v = (r: SigComputation, code: RowCode) => r.rows.find((x) => x.code === code)!.value;
const unresolved = (r: SigComputation) => r.unresolved.map((u) => `${u.account}:${u.reason}`);
function expectBalanced(r: SigComputation) {
  expect(r.integrity).toEqual({ ok: true, detail: null });
  expect(r.reconciliation.gap).toBe(0n);
}

describe("Statut des règles corrigées", () => {
  it("648, 649, 608, 609, 6098, 708 et 7098 ne sont jamais rattachés automatiquement sans condition", () => {
    for (const rs of [PCG24, PCG25]) {
      for (const p of ["648", "6481", "649", "608", "6087", "609", "6098", "708", "7085", "7098"]) {
        expect([rs.code, p, matchRule(rs, p)!.status]).toEqual([rs.code, p, "review"]);
      }
      for (const p of ["641", "644"]) expect(matchRule(rs, p)!.line).toBe("SALAIRES_TRAITEMENTS");
      for (const p of ["645", "646", "647"]) expect(matchRule(rs, p)!.line).toBe("CHARGES_SOCIALES");
      expect(matchRule(rs, "706")).toMatchObject({ status: "certain", line: "PRODUCTION_VENDUE" });
    }
  });

  it("687 / 787 conservés en exceptionnel (règle PCG certaine) dans les deux référentiels", () => {
    for (const rs of [PCG24, PCG25]) {
      expect(matchRule(rs, "6876")).toMatchObject({ status: "certain", line: "CHARGES_EXCEPTIONNELLES", basis: "pcg" });
      expect(matchRule(rs, "7876")).toMatchObject({ status: "certain", line: "PRODUITS_EXCEPTIONNELS", basis: "pcg" });
    }
    const r = computeSig(PCG25, [bal("706000", 0, 1000), bal("687100", 100, 0), bal("787100", 0, 40)], []);
    expect([v(r, "CHARGES_EXCEPTIONNELLES"), v(r, "PRODUITS_EXCEPTIONNELS"), v(r, "RESULTAT_EXCEPTIONNEL"), v(r, "RESULTAT_NET")])
      .toEqual([e(100), e(40), e(-60), e(940)]);
    expect(r.unresolved).toEqual([]);
    expectBalanced(r);
  });

  it("comparaison PCG 2024 / PCG 2025 sur les comptes sensibles", () => {
    const row = (p: string) => [PCG24, PCG25].map((rs) => { const m = matchRule(rs, p)!; return `${m.status}:${m.line ?? "-"}:${m.basis}`; });
    expect(row("671")).toEqual(["certain:CHARGES_EXCEPTIONNELLES:pcg", "removed:CHARGES_EXCEPTIONNELLES:pcg"]);
    expect(row("775")).toEqual(["certain:PRODUITS_EXCEPTIONNELS:pcg", "removed:PRODUITS_EXCEPTIONNELS:pcg"]);
    expect(row("791")).toEqual(["certain:REPRISES_EXPLOITATION:cabinet", "removed:-:pcg"]);
    expect(row("672")).toEqual(["transitional:CHARGES_EXCEPTIONNELLES:pcg", "transitional:CHARGES_EXCEPTIONNELLES:pcg"]);
    expect(row("678")).toEqual(["certain:CHARGES_EXCEPTIONNELLES:pcg", "certain:CHARGES_EXCEPTIONNELLES:pcg"]);
    expect(row("740")).toEqual(["certain:SUBVENTIONS_EXPLOITATION:pcg", "review:SUBVENTIONS_EXPLOITATION:pcg"]);
    expect(row("741")).toEqual(["certain:SUBVENTIONS_EXPLOITATION:pcg", "certain:SUBVENTIONS_EXPLOITATION:pcg"]);
    expect(row("742")).toEqual(["certain:SUBVENTIONS_EXPLOITATION:pcg", "review:AUTRES_PRODUITS:cabinet"]);
    expect(row("747")).toEqual(["certain:SUBVENTIONS_EXPLOITATION:pcg", "certain:AUTRES_PRODUITS:cabinet"]);
    expect(row("657")).toEqual(["certain:AUTRES_CHARGES:pcg", "certain:AUTRES_CHARGES:pcg"]);
    expect(row("7587")).toEqual(["certain:AUTRES_PRODUITS:pcg", "certain:AUTRES_PRODUITS:pcg"]);
  });
});

describe("648 et 649 — charges de personnel", () => {
  const base = [bal("706000", 0, 10000), bal("641000", 3000, 0), bal("645000", 1200, 0)];

  it("648 non classé : bloquant, aucune affectation silencieuse, écart de 500,00 €", () => {
    const r = computeSig(PCG25, [...base, bal("648000", 500, 0)], []);
    expect(unresolved(r)).toEqual(["648000:review"]);
    expect(r.unresolved[0].proposal).toBe("SALAIRES_TRAITEMENTS");
    expect(v(r, "SALAIRES_TRAITEMENTS")).toBe(e(3000));
    expect(r.reconciliation.gap).toBe(e(500));
  });

  it("1. 648 imputé aux salaires", () => {
    const r = computeSig(PCG25, [...base, bal("648000", 500, 0)], [ov("648000", "SALAIRES_TRAITEMENTS")]);
    expect([v(r, "SALAIRES_TRAITEMENTS"), v(r, "CHARGES_SOCIALES"), v(r, "CHARGES_PERSONNEL"), v(r, "EBE"), v(r, "RESULTAT_NET")])
      .toEqual([e(3500), e(1200), e(4700), e(5300), e(5300)]);
    expectBalanced(r);
  });

  it("2. 648 imputé aux cotisations sociales", () => {
    const r = computeSig(PCG25, [...base, bal("648000", 500, 0)], [ov("648000", "CHARGES_SOCIALES")]);
    expect([v(r, "SALAIRES_TRAITEMENTS"), v(r, "CHARGES_SOCIALES"), v(r, "CHARGES_PERSONNEL"), v(r, "EBE")])
      .toEqual([e(3000), e(1700), e(4700), e(5300)]);
    expectBalanced(r);
  });

  it("3. 649 remboursant des salaires : diminue les salaires, jamais un produit", () => {
    const r = computeSig(PCG25, [...base, bal("649000", 0, 400)], [ov("649000", "SALAIRES_TRAITEMENTS")]);
    expect([v(r, "SALAIRES_TRAITEMENTS"), v(r, "CHARGES_SOCIALES"), v(r, "CHIFFRE_AFFAIRES"), v(r, "AUTRES_PRODUITS")])
      .toEqual([e(2600), e(1200), e(10000), 0n]);
    expect([v(r, "VALEUR_AJOUTEE"), v(r, "EBE"), v(r, "RESULTAT_EXPLOITATION"), v(r, "RESULTAT_NET")])
      .toEqual([e(10000), e(6200), e(6200), e(6200)]);
    expectBalanced(r);
  });

  it("4. 649 remboursant des cotisations", () => {
    const r = computeSig(PCG25, [...base, bal("649000", 0, 400)], [ov("649000", "CHARGES_SOCIALES")]);
    expect([v(r, "SALAIRES_TRAITEMENTS"), v(r, "CHARGES_SOCIALES"), v(r, "EBE"), v(r, "RESULTAT_NET")])
      .toEqual([e(3000), e(800), e(6200), e(6200)]);
    expectBalanced(r);
  });
});

describe("708 et 7098 — produits des activités annexes", () => {
  it("5. 708 lié à des services : automatique en l'absence d'activité de marchandises", () => {
    const r = computeSig(PCG25, [bal("706000", 0, 10000), bal("708500", 0, 500)], []);
    expect(r.unresolved).toEqual([]);
    expect([v(r, "PRODUCTION_VENDUE"), v(r, "CHIFFRE_AFFAIRES"), v(r, "MARGE_COMMERCIALE")]).toEqual([e(10500), e(10500), 0n]);
    const via = r.rows.find((x) => x.code === "PRODUCTION_VENDUE")!.contributions.find((c) => c.account === "708500")!.via;
    expect(via).toMatchObject({ kind: "rule", prefix: "708", note: expect.stringContaining("Aucune vente ni achat de marchandises") });
    expectBalanced(r);
  });

  it("6. 708 lié à des marchandises : à confirmer, puis rattaché aux ventes sans double comptage", () => {
    const data = [bal("707000", 0, 8000), bal("607000", 5000, 0), bal("708500", 0, 300)];
    const before = computeSig(PCG25, data, []);
    expect(unresolved(before)).toEqual(["708500:review"]);
    expect(v(before, "CHIFFRE_AFFAIRES")).toBe(e(8000));
    const r = computeSig(PCG25, data, [ov("708500", "VENTES_MARCHANDISES")]);
    expect([v(r, "VENTES_MARCHANDISES"), v(r, "PRODUCTION_VENDUE"), v(r, "CHIFFRE_AFFAIRES"), v(r, "MARGE_COMMERCIALE"), v(r, "RESULTAT_NET")])
      .toEqual([e(8300), 0n, e(8300), e(3300), e(3300)]);
    expectBalanced(r);
  });

  it("7. 7098 ventilé comme les produits annexes auxquels il se rapporte", () => {
    const services = computeSig(PCG25, [bal("706000", 0, 10000), bal("708000", 0, 500), bal("709800", 50, 0)], []);
    expect([v(services, "PRODUCTION_VENDUE"), v(services, "CHIFFRE_AFFAIRES")]).toEqual([e(10450), e(10450)]);
    expectBalanced(services);
    const data = [bal("707000", 0, 1000), bal("708000", 0, 500), bal("709800", 50, 0)];
    expect(unresolved(computeSig(PCG25, data, []))).toEqual(["708000:review", "709800:review"]);
    const merch = computeSig(PCG25, data, [ov("708000", "VENTES_MARCHANDISES"), ov("709800", "VENTES_MARCHANDISES")]);
    expect([v(merch, "VENTES_MARCHANDISES"), v(merch, "PRODUCTION_VENDUE"), v(merch, "CHIFFRE_AFFAIRES")]).toEqual([e(1450), 0n, e(1450)]);
    expectBalanced(merch);
  });
});

describe("741, 742 et 747 — subventions (PCG 2025)", () => {
  const data = [bal("706000", 0, 10000), bal("741000", 0, 1000), bal("742000", 0, 2000), bal("747000", 0, 300), bal("681100", 400, 0)];

  it("8. différenciées : 741 dans l'EBE, 742 à confirmer, 747 après l'EBE", () => {
    const r = computeSig(PCG25, data, []);
    expect(unresolved(r)).toEqual(["742000:review"]);
    expect(r.unresolved[0].proposal).toBe("AUTRES_PRODUITS");
    expect([v(r, "SUBVENTIONS_EXPLOITATION"), v(r, "AUTRES_PRODUITS")]).toEqual([e(1000), e(300)]);
  });

  it("13. EBE et valeur ajoutée selon le classement retenu pour 742 ; résultat net identique", () => {
    const after = computeSig(PCG25, data, [ov("742000", "AUTRES_PRODUITS")]);
    expect([v(after, "VALEUR_AJOUTEE"), v(after, "EBE"), v(after, "AUTRES_PRODUITS"), v(after, "RESULTAT_EXPLOITATION"), v(after, "RESULTAT_NET")])
      .toEqual([e(10000), e(11000), e(2300), e(12900), e(12900)]);
    expectBalanced(after);
    const inEbe = computeSig(PCG25, data, [ov("742000", "SUBVENTIONS_EXPLOITATION")]);
    expect([v(inEbe, "VALEUR_AJOUTEE"), v(inEbe, "EBE"), v(inEbe, "AUTRES_PRODUITS"), v(inEbe, "RESULTAT_EXPLOITATION"), v(inEbe, "RESULTAT_NET")])
      .toEqual([e(10000), e(13000), e(300), e(12900), e(12900)]);
    expectBalanced(inEbe);
  });

  it("PCG 2024 : 74 en subventions d'exploitation, subventions d'équilibre (7715) en exceptionnel", () => {
    const r = computeSig(PCG24, [bal("706000", 0, 10000), bal("740000", 0, 1000), bal("771500", 0, 2000)], []);
    expect([v(r, "SUBVENTIONS_EXPLOITATION"), v(r, "PRODUITS_EXCEPTIONNELS"), v(r, "EBE"), v(r, "RESULTAT_NET")]).toEqual([e(1000), e(2000), e(11000), e(13000)]);
    expectBalanced(r);
  });
});

describe("672 et 772 — comptes transitoires", () => {
  const data = [bal("706000", 0, 10000), bal("672000", 100, 0), bal("772000", 0, 50)];
  const ctx = (computation: SigComputation, definitive: boolean): CheckContext => ({
    ruleSet: PCG25, period: resolvePeriod({ id: "f", label: "2025", startDate: "2025-01-01", endDate: "2025-12-31" }, "fiscal_year", null)!,
    computation, source: { kind: "trial_balance", provisional: !definitive, coveredUntil: "2025-12-31", closingEntries: [] },
    divergence: null, comparison: { ruleSetCode: "PCG-2025", months: 12, available: true }, fiscalYearOpen: false, definitive,
  });
  const codes = (c: ReturnType<typeof buildChecks>) => c.map((x) => `${x.code}:${x.severity}`);

  it("9. situation provisoire : signalés et à vérifier, jamais présumés exceptionnels", () => {
    const r = computeSig(PCG25, data, []);
    expect(unresolved(r)).toEqual(["672000:transitional", "772000:transitional"]);
    expect(v(r, "RESULTAT_EXCEPTIONNEL")).toBe(0n);
    const checks = buildChecks(ctx(r, false));
    expect(codes(checks)).toEqual(["transitional_accounts:blocking", "result_mismatch:blocking", "provisional_data:warning"]);
    expect(checks[0].title).toBe("Comptes 672 / 772 à vérifier");
  });

  it("10. clôture définitive : anomalie bloquante ; classement par exception tracé, montants inchangés", () => {
    const r = computeSig(PCG25, data, []);
    expect(buildChecks(ctx(r, true))[0]).toMatchObject({ code: "transitional_accounts", severity: "blocking", title: "Comptes 672 / 772 non régularisés à la clôture" });
    const fixed = computeSig(PCG25, data, [ov("672000", "AUTRES_ACHATS_CHARGES_EXTERNES"), ov("772000", "PRODUCTION_VENDUE")]);
    expect([v(fixed, "AUTRES_ACHATS_CHARGES_EXTERNES"), v(fixed, "PRODUCTION_VENDUE"), v(fixed, "RESULTAT_NET")]).toEqual([e(100), e(10050), e(9950)]);
    expectBalanced(fixed);
    expect(codes(buildChecks(ctx(fixed, true)))).toEqual(["overrides_used:warning", "transitional_reclassified:warning"]);
    expect(codes(buildChecks(ctx(fixed, false)))).toEqual(["provisional_data:warning", "overrides_used:warning"]);
  });
});

describe("12. Reclassement : conservation des montants", () => {
  it("un compte quitte une rubrique et rejoint l'autre, sans duplication ni perte ; résultat réconcilié", () => {
    const data = [bal("706000", 0, 10000), bal("641000", 3000, 0), bal("645000", 1200, 0), bal("648000", 500, 0), bal("606100", 700, 0)];
    const a = computeSig(PCG25, data, [ov("648000", "SALAIRES_TRAITEMENTS")]);
    const b = computeSig(PCG25, data, [ov("648000", "AUTRES_ACHATS_CHARGES_EXTERNES")]);
    expect(v(b, "SALAIRES_TRAITEMENTS") - v(a, "SALAIRES_TRAITEMENTS")).toBe(e(-500));
    expect(v(b, "AUTRES_ACHATS_CHARGES_EXTERNES") - v(a, "AUTRES_ACHATS_CHARGES_EXTERNES")).toBe(e(500));
    for (const line of PCG25.lines.map((l) => l.code).filter((c) => c !== "SALAIRES_TRAITEMENTS" && c !== "AUTRES_ACHATS_CHARGES_EXTERNES")) {
      expect([line, v(b, line)]).toEqual([line, v(a, line)]);
    }
    expect([v(a, "VALEUR_AJOUTEE"), v(a, "EBE")]).toEqual([e(9300), e(4600)]);
    expect([v(b, "VALEUR_AJOUTEE"), v(b, "EBE")]).toEqual([e(8800), e(4600)]);
    expect(v(a, "RESULTAT_NET")).toBe(v(b, "RESULTAT_NET"));
    expectBalanced(a);
    expectBalanced(b);
  });
});
