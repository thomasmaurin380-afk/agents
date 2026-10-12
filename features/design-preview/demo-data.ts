/**
 * DONNÉES FICTIVES — uniquement pour la maquette de conception (/daf/maquette, activée par
 * DESIGN_PREVIEW=1). Aucune valeur ne provient d'une entreprise ni d'un calcul de l'application ;
 * elles ne doivent jamais être utilisées dans une page opérationnelle.
 *
 * Un seul jeu de données et une seule fonction de dérivation (`getDemoDashboard`) : les deux
 * modes d'interface présentent exactement les mêmes valeurs (même source de vérité). En Phase 4,
 * un service applicatif renverra le même type `DashboardData` à partir des données réelles.
 */

export const DEMO_PERIOD = { label: "Déc. 2026", range: "Janv. 2026 – Déc. 2026", previous: "Déc. 2025" };
export const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
export const MONTHS_FULL = MONTHS.map((_, i) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1))));

type Line = { key: string; label: string; current: number; previous: number };

/** Bilan au 31/12/2026 et au 31/12/2025 (fictif). */
const ASSETS: Line[] = [
  { key: "immobilisations", label: "Actifs immobilisés", current: 1_691_573, previous: 1_482_220 },
  { key: "stocks", label: "Stocks", current: 979_332, previous: 864_118 },
  { key: "creances", label: "Créances clients", current: 801_271, previous: 712_405 },
  { key: "tresorerie", label: "Trésorerie et équivalents", current: 712_241, previous: 689_550 },
  { key: "autres", label: "Autres actifs", current: 267_091, previous: 243_886 },
];
const LIABILITIES: Line[] = [
  { key: "dettes_fin", label: "Dettes financières", current: 1_042_300, previous: 980_000 },
  { key: "fournisseurs", label: "Dettes fournisseurs", current: 868_410, previous: 812_300 },
  { key: "fiscales", label: "Dettes fiscales et sociales", current: 412_638, previous: 398_100 },
  { key: "autres_dettes", label: "Autres dettes", current: 128_200, previous: 121_466 },
];
const EQUITY_SPLIT: Omit<Line, "current" | "previous">[] = [
  { key: "capital", label: "Capital et réserves" },
  { key: "resultat", label: "Résultat de l'exercice" },
];

/** Évolution mensuelle (fictive) des totaux de bilan, en euros. */
const MONTHLY_ASSETS = [3_992_179, 4_031_400, 4_068_250, 4_101_900, 4_139_700, 4_176_300, 4_212_800, 4_248_900, 4_286_100, 4_331_600, 4_389_200, 4_451_508];
const MONTHLY_LIABILITIES = [2_311_866, 2_322_400, 2_334_900, 2_341_200, 2_352_800, 2_366_100, 2_378_300, 2_389_900, 2_401_100, 2_416_300, 2_432_700, 2_451_548];

/** Compte de résultat mensuel (fictif). */
const MONTHLY_REVENUE = [92_400, 97_800, 104_300, 96_200, 99_600, 101_900, 103_400, 108_200, 104_900, 110_800, 109_420, 119_400];
const MONTHLY_EXPENSES = [80_600, 83_900, 86_100, 81_700, 83_200, 84_900, 85_100, 87_900, 86_400, 88_900, 87_970, 94_000];
const MONTHLY_TAX_RATE = 0.188; // impôt fictif appliqué au résultat d'exploitation
const MONTHLY_RECEIVABLES = [712_405, 728_900, 741_300, 733_800, 752_100, 760_400, 768_200, 779_900, 772_600, 788_300, 792_800, 801_271];
const MONTHLY_PAYABLES = [812_300, 818_600, 821_900, 829_400, 832_100, 838_600, 842_900, 849_100, 853_700, 858_300, 861_900, 868_410];
const MONTHLY_CASH = [689_550, 671_200, 664_800, 682_900, 694_100, 676_300, 698_400, 703_200, 689_900, 701_600, 706_800, 712_241];
const ANNUAL_TARGET = 250_000;

const EXPENSE_BREAKDOWN = [
  { label: "Ressources humaines", share: 0.38 },
  { label: "Achats & sous-traitance", share: 0.26 },
  { label: "Frais généraux", share: 0.18 },
];

/** Entités d'un groupe fictif (données saisies, non consolidées par l'application). */
const ENTITIES = [
  { name: "Holding", assets: 1_352_404, liabilities: 945_146, workingCapital: 612_380, liquidity: 1.327, debtRatio: 0.698 },
  { name: "France SAS", assets: 1_045_225, liabilities: 581_442, workingCapital: 391_110, liquidity: 1.753, debtRatio: 0.557 },
  { name: "Filiale Belgique", assets: 1_293_804, liabilities: 673_562, workingCapital: 487_610, liquidity: 1.635, debtRatio: 0.521 },
  { name: "Filiale Espagne", assets: 760_067, liabilities: 251_398, workingCapital: 298_445, liquidity: 1.926, debtRatio: 0.331 },
];

const OPERATIONS = [
  { date: "12 déc. 2026", label: "Facture F-2026-0847 — Acme SAS", category: "Vente", amount: 12_480, status: "Payée", method: "Virement" },
  { date: "11 déc. 2026", label: "Achat matériel — Dell Technologies", category: "Équipement", amount: -3_250, status: "Comptabilisée", method: "Carte entreprise" },
  { date: "10 déc. 2026", label: "Salaires — Équipe marketing", category: "Ressources humaines", amount: -18_460, status: "Comptabilisée", method: "Virement" },
  { date: "9 déc. 2026", label: "Remboursement de TVA", category: "Fiscalité", amount: 6_320, status: "Payée", method: "Virement" },
  { date: "8 déc. 2026", label: "Abonnement logiciel collaboratif", category: "Logiciels", amount: -240, status: "Comptabilisée", method: "Prélèvement" },
] as const;

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const change = (cur: number, prev: number) => (prev === 0 ? 0 : cur / prev - 1);

/** Dérivation unique (totaux, ratios, variations) partagée par les deux modes. */
export function getDemoDashboard() {
  const totalAssets = sum(ASSETS.map((a) => a.current));
  const totalAssetsPrev = sum(ASSETS.map((a) => a.previous));
  const totalLiabilities = sum(LIABILITIES.map((l) => l.current));
  const totalLiabilitiesPrev = sum(LIABILITIES.map((l) => l.previous));
  const equity = totalAssets - totalLiabilities;
  const equityPrev = totalAssetsPrev - totalLiabilitiesPrev;
  const financialDebt = LIABILITIES[0];
  const gearing = financialDebt.current / equity;
  const gearingPrev = financialDebt.previous / equityPrev;

  const monthlyResult = MONTHLY_REVENUE.map((r, i) => Math.round((r - MONTHLY_EXPENSES[i]) * (1 - MONTHLY_TAX_RATE)));
  const revenue = sum(MONTHLY_REVENUE);
  const expenses = sum(MONTHLY_EXPENSES);
  const netResult = sum(monthlyResult);
  const revenuePrev = Math.round(revenue / 1.124);
  const expensesPrev = Math.round(expenses / 1.061);

  const otherExpenses = expenses - EXPENSE_BREAKDOWN.reduce((s, e) => s + Math.round(expenses * e.share), 0);
  const expenseBreakdown = [
    ...EXPENSE_BREAKDOWN.map((e) => ({ label: e.label, value: Math.round(expenses * e.share) })),
    { label: "Impôts, taxes et autres", value: otherExpenses },
  ];
  const monthlyEquity = MONTHLY_ASSETS.map((a, i) => a - MONTHLY_LIABILITIES[i]);

  return {
    period: DEMO_PERIOD,
    balance: {
      totalAssets, totalAssetsPrev, totalLiabilities, totalLiabilitiesPrev, equity, equityPrev, gearing, gearingPrev,
      assets: ASSETS,
      liabilities: LIABILITIES,
      equityLines: [
        { ...EQUITY_SPLIT[0], current: equity - netResult, previous: equityPrev - Math.round(netResult * 0.86) },
        { ...EQUITY_SPLIT[1], current: netResult, previous: Math.round(netResult * 0.86) },
      ],
      change: {
        assets: change(totalAssets, totalAssetsPrev),
        liabilities: change(totalLiabilities, totalLiabilitiesPrev),
        equity: change(equity, equityPrev),
        gearingPts: (gearing - gearingPrev) * 100,
      },
      monthly: { assets: MONTHLY_ASSETS, liabilities: MONTHLY_LIABILITIES, equity: monthlyEquity, gearing: monthlyEquity.map((e, i) => (financialDebt.previous + ((financialDebt.current - financialDebt.previous) * i) / 11) / e) },
      entities: ENTITIES.map((e) => ({ ...e, equity: e.assets - e.liabilities })),
    },
    performance: {
      revenue, revenuePrev, expenses, expensesPrev, netResult, netMargin: netResult / revenue,
      netMarginPrevPts: 2.1, targetResult: ANNUAL_TARGET, targetProgress: netResult / ANNUAL_TARGET,
      lastMonthResultChange: change(monthlyResult[11], monthlyResult[10]),
      cash: MONTHLY_CASH[11], cashChange: change(MONTHLY_CASH[11], MONTHLY_CASH[5]),
      receivables: MONTHLY_RECEIVABLES[11], receivablesChange: change(MONTHLY_RECEIVABLES[11], MONTHLY_RECEIVABLES[0]),
      payables: MONTHLY_PAYABLES[11], payablesChange: change(MONTHLY_PAYABLES[11], MONTHLY_PAYABLES[0]),
      monthly: { revenue: MONTHLY_REVENUE, expenses: MONTHLY_EXPENSES, result: monthlyResult, cumulativeResult: monthlyResult.map((_, i) => sum(monthlyResult.slice(0, i + 1))), cash: MONTHLY_CASH, receivables: MONTHLY_RECEIVABLES, payables: MONTHLY_PAYABLES },
      expenseBreakdown,
    },
    operations: OPERATIONS,
  };
}

export type DashboardData = ReturnType<typeof getDemoDashboard>;
