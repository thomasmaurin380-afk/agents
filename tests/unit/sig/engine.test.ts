import { describe, expect, it } from "vitest";
import { buildChecks, type CheckContext } from "@/domain/sig/checks";
import { compareSources, computeSig, differenceBalances } from "@/domain/sig/compute";
import { comparisonPeriod, fiscalMonths, previousFiscalYear, resolvePeriod } from "@/domain/sig/periods";
import { matchRule, RULE_SETS, ruleSetFor } from "@/domain/sig/rules";
import type { AccountBalance, Override, RowCode } from "@/domain/sig/types";

/**
 * Jeux de référence : les valeurs attendues sont calculées à la main (en centimes), indépendamment
 * du moteur, à partir des définitions de docs/sig-rules.md.
 */
const PCG24 = RULE_SETS["PCG-2024"];
const PCG25 = RULE_SETS["PCG-2025"];

/** Solde d'un compte : montants en euros (chaînes) convertis en centimes. */
function bal(account: string, debit: string, credit: string, pcg: string | null = account.replace(/0+$/, "").padEnd(3, "0")): AccountBalance {
  const c = (s: string) => BigInt(Math.round(Number(s) * 100));
  return { account, label: `Compte ${account}`, pcgAccount: pcg, net: c(debit) - c(credit), debit: c(debit), credit: c(credit), origin: { importId: "imp", fileName: "f", rows: [1] } };
}
const value = (r: ReturnType<typeof computeSig>, code: RowCode) => r.rows.find((x) => x.code === code)!.value;

describe("Référentiels SIG", () => {
  it("sélectionne le référentiel selon la date d'ouverture (règlement ANC 2022-06)", () => {
    expect(ruleSetFor("2024-07-01").code).toBe("PCG-2024");
    expect(ruleSetFor("2024-12-31").code).toBe("PCG-2024");
    expect(ruleSetFor("2025-01-01").code).toBe("PCG-2025");
  });

  it("applique la règle la plus spécifique (préfixe le plus long)", () => {
    expect(matchRule(PCG24, "6037")!.line).toBe("VARIATION_STOCK_MARCHANDISES");
    expect(matchRule(PCG24, "60310")!.line).toBe("VARIATION_STOCK_MATIERES");
    expect(matchRule(PCG24, "603")!.status).toBe("review");
    expect(matchRule(PCG24, "6551")!.line).toBe("QUOTE_PART_PERTE");
    expect(matchRule(PCG24, "6588")!.line).toBe("AUTRES_CHARGES");
    expect(matchRule(PCG25, "6712")!.status).toBe("removed");
    expect(matchRule(PCG25, "678")!.line).toBe("CHARGES_EXCEPTIONNELLES");
    expect(matchRule(PCG25, "791")!.status).toBe("removed");
    expect(matchRule(PCG24, "791")!.line).toBe("REPRISES_EXPLOITATION");
  });

  it("chaque règle pointe vers une ligne existante ; chaque ligne est affichée une fois", () => {
    for (const rs of [PCG24, PCG25]) {
      const codes = new Set(rs.lines.map((l) => l.code));
      for (const r of rs.rules) if (r.line) expect(codes.has(r.line)).toBe(true);
      const refs = rs.layout.map((l) => l.ref);
      expect(new Set(refs).size).toBe(refs.length);
      for (const l of rs.lines) expect(refs).toContain(l.code);
      const prefixes = rs.rules.map((r) => r.prefix);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    }
  });
});

describe("AZUR CONSEIL SA — balance 2025 (8 comptes)", () => {
  const tb = [
    bal("101000", "0", "10000.00"), bal("401000", "0", "628.80"), bal("445710", "0", "3570.00"),
    bal("706000", "0", "17850.00"), bal("512000", "20983.60", "0"), bal("411000", "4470.00", "0"),
    bal("615000", "5496.00", "0"), bal("445660", "1099.20", "0"),
  ];
  const r = computeSig(PCG25, tb, []);

  it("résultat net 12 354,00 €, rapprochement à 0,00 €", () => {
    expect(value(r, "RESULTAT_NET")).toBe(1_235_400n);
    expect(r.reconciliation).toEqual({ sigResult: 1_235_400n, accountingResult: 1_235_400n, gap: 0n });
    expect(r.unresolved).toEqual([]);
    expect(r.plAccountCount).toBe(2);
  });

  it("soldes intermédiaires attendus", () => {
    expect(value(r, "CHIFFRE_AFFAIRES")).toBe(1_785_000n);
    expect(value(r, "MARGE_COMMERCIALE")).toBe(0n);
    expect(value(r, "PRODUCTION_EXERCICE")).toBe(1_785_000n);
    expect(value(r, "CONSOMMATIONS_TIERS")).toBe(549_600n);
    for (const code of ["VALEUR_AJOUTEE", "EBE", "RESULTAT_EXPLOITATION", "RESULTAT_COURANT_AVANT_IMPOTS"] as const) {
      expect(value(r, code)).toBe(1_235_400n);
    }
    expect(value(r, "RESULTAT_EXCEPTIONNEL")).toBe(0n);
  });

  it("détail : chaque ligne est la somme exacte de ses comptes, avec la règle et l'origine", () => {
    for (const row of r.rows.filter((x) => x.kind === "line")) {
      expect(row.contributions.reduce((s, c) => s + c.amount, 0n)).toBe(row.value);
    }
    const ca = r.rows.find((x) => x.code === "PRODUCTION_VENDUE")!.contributions;
    expect(ca).toHaveLength(1);
    expect(ca[0]).toMatchObject({ account: "706000", amount: 1_785_000n, via: { kind: "rule", prefix: "706" }, origin: { importId: "imp" } });
  });
});

describe("Scénarios de référence (valeurs calculées à la main)", () => {
  it("entreprise commerciale : marge, variation de stock, rabais accordés", () => {
    const r = computeSig(PCG24, [
      bal("707000", "0", "100000"), bal("709700", "1000", "0"), bal("607000", "60000", "0"),
      bal("603700", "0", "5000"), // stock final > stock initial : variation créditrice
    ], []);
    expect(value(r, "VENTES_MARCHANDISES")).toBe(9_900_000n);
    expect(value(r, "VARIATION_STOCK_MARCHANDISES")).toBe(-500_000n);
    expect(value(r, "COUT_ACHAT_MARCHANDISES")).toBe(5_500_000n);
    expect(value(r, "MARGE_COMMERCIALE")).toBe(4_400_000n);
    expect(value(r, "RESULTAT_NET")).toBe(4_400_000n);
    expect(r.reconciliation.gap).toBe(0n);
  });

  const production = [
    bal("701000", "0", "200000"), bal("713500", "0", "10000"), bal("713300", "3000", "0"), bal("720000", "0", "5000"),
    bal("601000", "50000", "0"), bal("603100", "2000", "0"), bal("613000", "10000", "0"), bal("621000", "4000", "0"),
    bal("641000", "40000", "0"), bal("645000", "16000", "0"), bal("740000", "0", "3000"), bal("631000", "2000", "0"),
    bal("681100", "9000", "0"), bal("781500", "0", "1000"), bal("758000", "0", "500"), bal("651000", "700", "0"),
    bal("761000", "0", "300"), bal("661100", "1200", "0"), bal("686000", "100", "0"),
    bal("771000", "0", "2000"), bal("671000", "500", "0"), bal("675000", "1000", "0"), bal("775000", "0", "1500"),
    bal("691000", "1000", "0"), bal("695000", "20000", "0"),
  ];

  it("entreprise de production, PCG 2024 : tous les soldes", () => {
    const r = computeSig(PCG24, production, []);
    const expected: Partial<Record<RowCode, bigint>> = {
      PRODUCTION_STOCKEE: 700_000n, PRODUCTION_EXERCICE: 21_200_000n, CONSOMMATIONS_TIERS: 6_600_000n,
      VALEUR_AJOUTEE: 14_600_000n, CHARGES_PERSONNEL: 5_600_000n, EBE: 9_100_000n,
      RESULTAT_EXPLOITATION: 8_280_000n, CHARGES_FINANCIERES: 130_000n, RESULTAT_COURANT_AVANT_IMPOTS: 8_180_000n,
      RESULTAT_EXCEPTIONNEL: 200_000n, RESULTAT_NET: 6_280_000n,
    };
    for (const [code, v] of Object.entries(expected)) expect([code, value(r, code as RowCode)]).toEqual([code, v]);
    expect(r.reconciliation).toEqual({ sigResult: 6_280_000n, accountingResult: 6_280_000n, gap: 0n });
  });

  it("mêmes comptes en PCG 2025 : 671/675/771/775 sont bloquants, l'écart n'est jamais comblé", () => {
    const r = computeSig(PCG25, production, []);
    expect(r.unresolved.map((u) => [u.account, u.reason])).toEqual([
      ["671000", "removed"], ["675000", "removed"], ["771000", "removed"], ["775000", "removed"],
    ]);
    expect(value(r, "RESULTAT_NET")).toBe(6_080_000n);
    expect(r.reconciliation.gap).toBe(-200_000n);
  });

  it("PCG 2025 : cessions en exploitation (657/757), 678/778 en exceptionnel, 747 en autres produits", () => {
    const r = computeSig(PCG25, [
      bal("706000", "0", "10000"), bal("657000", "1000", "0"), bal("757000", "0", "1500"),
      bal("778000", "0", "2000"), bal("678000", "500", "0"), bal("747000", "0", "800"), bal("740000", "0", "200"),
    ], []);
    expect(value(r, "AUTRES_CHARGES")).toBe(100_000n);
    expect(value(r, "AUTRES_PRODUITS")).toBe(230_000n);
    expect(value(r, "SUBVENTIONS_EXPLOITATION")).toBe(20_000n);
    expect(value(r, "EBE")).toBe(1_020_000n);
    expect(value(r, "RESULTAT_EXPLOITATION")).toBe(1_150_000n);
    expect(value(r, "RESULTAT_EXCEPTIONNEL")).toBe(150_000n);
    expect(value(r, "RESULTAT_NET")).toBe(1_300_000n);
    expect(r.reconciliation.gap).toBe(0n);
  });

  it("PCG 2024 : transferts de charges 791/796/797", () => {
    const r = computeSig(PCG24, [bal("706000", "0", "1000"), bal("791000", "0", "100"), bal("796000", "0", "10"), bal("797000", "0", "1")], []);
    expect(value(r, "REPRISES_EXPLOITATION")).toBe(10_000n);
    expect(value(r, "PRODUITS_FINANCIERS")).toBe(1_000n);
    expect(value(r, "PRODUITS_EXCEPTIONNELS")).toBe(100n);
    expect(value(r, "RESULTAT_NET")).toBe(111_100n);
  });

  it("charges créditrices, produits débiteurs et report en arrière des déficits", () => {
    const r = computeSig(PCG25, [
      bal("706000", "50", "1000"), bal("606100", "0", "100"), bal("699000", "0", "300"), bal("695000", "200", "0"),
    ], []);
    expect(value(r, "PRODUCTION_VENDUE")).toBe(95_000n);
    expect(value(r, "AUTRES_ACHATS_CHARGES_EXTERNES")).toBe(-10_000n);
    expect(value(r, "IMPOTS_BENEFICES")).toBe(-10_000n);
    expect(value(r, "RESULTAT_NET")).toBe(115_000n);
    expect(r.reconciliation.gap).toBe(0n);
  });

  it("compte à confirmer : bloquant tant qu'une exception justifiée ne le classe pas", () => {
    const data = [bal("706000", "0", "1000"), bal("600000", "300", "0", "600")];
    const before = computeSig(PCG25, data, []);
    expect(before.unresolved).toMatchObject([{ account: "600000", reason: "review", proposal: "AUTRES_ACHATS_CHARGES_EXTERNES" }]);
    expect(before.reconciliation.gap).toBe(30_000n);
    const ov: Override = { id: "ov1", account: "600000", line: "ACHATS_MATIERES", justification: "Achats de bois" };
    const after = computeSig(PCG25, data, [ov]);
    expect(after.unresolved).toEqual([]);
    expect(value(after, "ACHATS_MATIERES")).toBe(30_000n);
    expect(after.rows.find((x) => x.code === "ACHATS_MATIERES")!.contributions[0].via).toEqual({ kind: "override", overrideId: "ov1", justification: "Achats de bois" });
    expect(after.reconciliation.gap).toBe(0n);
    // Une exception d'une autre entreprise (autre numéro de compte) n'a aucun effet.
    expect(computeSig(PCG25, data, [{ ...ov, account: "600001" }]).unresolved).toHaveLength(1);
  });

  it("compte sans rattachement PCG et absence de comptes de gestion", () => {
    const r = computeSig(PCG25, [bal("706000", "0", "10"), bal("6ZZ", "5", "0", null)], []);
    expect(r.unresolved).toMatchObject([{ account: "6ZZ", reason: "no_pcg" }]);
    const none = computeSig(PCG25, [bal("512000", "10", "0"), bal("101000", "0", "10")], []);
    expect(none.plAccountCount).toBe(0);
    expect(value(none, "RESULTAT_NET")).toBe(0n);
  });

  it("solde mensuel = cumul fin de mois − cumul fin du mois précédent ; comparaison des sources", () => {
    const feb = [bal("706000", "0", "3000"), bal("615000", "800", "0")];
    const jan = [bal("706000", "0", "1000"), bal("615000", "800", "0"), bal("622600", "50", "0")];
    const month = differenceBalances(feb, jan);
    const r = computeSig(PCG25, month, []);
    expect(value(r, "PRODUCTION_VENDUE")).toBe(200_000n);
    expect(value(r, "AUTRES_ACHATS_CHARGES_EXTERNES")).toBe(-5_000n);
    expect(compareSources(feb, jan)).toEqual([
      { account: "622600", label: "Compte 622600", a: 0n, b: 5_000n },
      { account: "706000", label: "Compte 706000", a: -300_000n, b: -100_000n },
    ]);
  });
});

describe("Périodes", () => {
  const fy = { id: "fy2", label: "2025-2026", startDate: "2025-07-01", endDate: "2026-06-30" };
  const prev = { id: "fy1", label: "2024-2025", startDate: "2024-07-01", endDate: "2025-06-30" };

  it("exercice décalé : 12 mois à partir de juillet", () => {
    const m = fiscalMonths(fy);
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ month: 1, start: "2025-07-01", end: "2025-07-31", label: "juillet 2025" });
    expect(m[7]).toMatchObject({ month: 8, start: "2026-02-01", end: "2026-02-28" });
    expect(resolvePeriod(fy, "ytd", 7)).toMatchObject({ start: "2025-07-01", end: "2026-01-31", months: 7 });
    expect(resolvePeriod(fy, "month", 13)).toBeNull();
  });

  it("N-1 : exercice se terminant la veille, même rang de mois", () => {
    expect(previousFiscalYear(fy, [prev, fy])).toBe(prev);
    expect(previousFiscalYear(prev, [prev, fy])).toBeNull();
    expect(comparisonPeriod(resolvePeriod(fy, "month", 8)!, prev)).toMatchObject({ start: "2025-02-01", end: "2025-02-28" });
    const short = { id: "s", label: "court", startDate: "2025-01-01", endDate: "2025-06-30" };
    expect(comparisonPeriod(resolvePeriod(fy, "month", 8)!, short)).toBeNull();
  });
});

describe("Contrôles", () => {
  const r = computeSig(PCG25, [bal("706000", "0", "100")], []);
  const ctx = (over: Partial<CheckContext>): CheckContext => ({
    ruleSet: PCG25, period: resolvePeriod({ id: "f", label: "2025", startDate: "2025-01-01", endDate: "2025-12-31" }, "fiscal_year", null)!,
    computation: r, source: { kind: "trial_balance", provisional: false, coveredUntil: "2025-12-31", closingEntries: [] },
    divergence: null, comparison: { ruleSetCode: "PCG-2025", months: 12, available: true }, fiscalYearOpen: false, ...over,
  });
  const codes = (c: ReturnType<typeof buildChecks>) => c.map((x) => `${x.code}:${x.severity}`);

  it("aucun contrôle sur un calcul complet et rapproché", () => {
    expect(buildChecks(ctx({}))).toEqual([]);
  });

  it("divergence balance/FEC : bloquante sans choix explicite, avertissement avec choix", () => {
    const d = { accounts: [{ account: "706000", label: "", a: -100n, b: -90n }], explicitChoice: false };
    expect(codes(buildChecks(ctx({ divergence: d })))).toEqual(["sources_diverge:blocking"]);
    expect(codes(buildChecks(ctx({ divergence: { ...d, explicitChoice: true } })))).toEqual(["sources_diverge:warning"]);
  });

  it("N-1 absent, durées et référentiels différents, écritures de clôture", () => {
    expect(codes(buildChecks(ctx({ comparison: null })))).toEqual(["no_previous:warning"]);
    expect(codes(buildChecks(ctx({ comparison: { ruleSetCode: "PCG-2024", months: 6, available: true } }))))
      .toEqual(["durations_differ:warning", "rule_sets_differ:warning"]);
    expect(codes(buildChecks(ctx({ source: { kind: "fec", provisional: false, coveredUntil: null, closingEntries: [{ entryNumber: "CL1", journal: "OD", date: "2025-12-31" }] } }))))
      .toEqual(["closing_entries:blocking"]);
  });
});
