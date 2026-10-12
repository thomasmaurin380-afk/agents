import { centsToDecimal, decimalToCents, percentOf, variation } from "@/domain/sig/report";
import {
  DEMO_ACTIVITY, DEMO_ASSET_GROUPS, DEMO_BALANCE, DEMO_ENTITIES, DEMO_FISCAL_YEAR, DEMO_MONTHLY_BALANCE, DEMO_MONTHS_LONG,
  DEMO_MONTHS_SHORT, DEMO_OPERATIONS, DEMO_RESULT_TARGET, DEMO_TREASURY_MONTHS, type BalanceLine, type DemoEntityId,
} from "./data";

/**
 * Modèle unique de la maquette : toutes les valeurs affichées par les deux modes d'interface en
 * proviennent. Les compositions (analyse, pilotage) ne calculent rien : elles choisissent quoi
 * montrer et comment. Les règles de calcul (variation, pourcentage arrondi au dixième) sont
 * celles du domaine (`domain/sig/report`), sans copie locale.
 */

/** Sens économique d'une hausse : une hausse des dettes est défavorable, celle des capitaux propres favorable. */
export type Sense = "higher_is_better" | "lower_is_better" | "neutral";
export type Tone = "favorable" | "defavorable" | "neutre";

export type Variation = { amount: string; percent: string | null } | null;

export type AmountMetric = {
  key: string;
  label: string;
  value: string;
  previous: string | null;
  variation: Variation;
  tone: Tone;
  /** Série mensuelle de l'exercice (consolidé uniquement). */
  series: string[] | null;
};

export type RatioMetric = {
  key: string;
  label: string;
  /** Pourcentage arrondi au dixième, virgule décimale (« 55,1 »). */
  value: string | null;
  previous: string | null;
  /** Écart en points, au dixième (« -0,4 »). */
  deltaPoints: string | null;
  tone: Tone;
  series: (string | null)[] | null;
};

export type ShareRow = { key: string; label: string; amount: string; share: string | null };
export type DetailRow = { key: string; label: string; n: string; n1: string; variation: Variation; share: string | null };

const sumCents = (values: readonly string[]) => values.reduce((s, v) => s + decimalToCents(v), 0n);
const sum = (values: readonly string[]) => centsToDecimal(sumCents(values));
const sub = (a: string, b: string) => centsToDecimal(decimalToCents(a) - decimalToCents(b));
const ratio = (num: string, den: string) => percentOf(decimalToCents(num), decimalToCents(den));

/** « 55,1 » → 551 (dixièmes de point). */
const tenths = (p: string) => BigInt(p.replace(",", ""));
function pointsBetween(current: string | null, previous: string | null): string | null {
  if (current == null || previous == null) return null;
  const d = tenths(current) - tenths(previous);
  const a = d < 0n ? -d : d;
  return `${d < 0n ? "-" : ""}${a / 10n},${a % 10n}`;
}

export function toneOf(sense: Sense, delta: string | null): Tone {
  if (delta == null || sense === "neutral") return "neutre";
  const sign = delta.startsWith("-") ? -1 : /^[0,.]+$/.test(delta) ? 0 : 1;
  if (sign === 0) return "neutre";
  return (sign > 0) === (sense === "higher_is_better") ? "favorable" : "defavorable";
}

function amountMetric(key: string, label: string, value: string, previous: string | null, sense: Sense, series: string[] | null = null): AmountMetric {
  const v = variation(value, previous);
  return { key, label, value, previous, variation: v, tone: toneOf(sense, v?.amount ?? null), series };
}

function shares(rows: { key: string; label: string; amount: string }[]): { total: string; rows: ShareRow[] } {
  const total = sum(rows.map((r) => r.amount));
  return { total, rows: rows.map((r) => ({ ...r, share: ratio(r.amount, total) })) };
}

function detail(lines: BalanceLine[]) {
  const total = sum(lines.map((l) => l.n));
  const totalN1 = sum(lines.map((l) => l.n1));
  return {
    total,
    totalN1,
    totalVariation: variation(total, totalN1),
    rows: lines.map<DetailRow>((l) => ({ key: l.key, label: l.label, n: l.n, n1: l.n1, variation: variation(l.n, l.n1), share: ratio(l.n, total) })),
  };
}

export type Scope = "all" | DemoEntityId;

export function isScope(v: unknown): v is Scope {
  return v === "all" || DEMO_ENTITIES.some((e) => e.id === v);
}

export function buildDashboardModel(scope: Scope = "all") {
  const last = DEMO_MONTHLY_BALANCE.actifs.length - 1;
  const actifsN = sum(DEMO_BALANCE.actifs.map((l) => l.n));
  const passifsN = sum(DEMO_BALANCE.passifs.map((l) => l.n));
  const capitauxN = sub(actifsN, passifsN);
  const monthlyCapitaux = DEMO_MONTHLY_BALANCE.actifs.map((a, i) => sub(a, DEMO_MONTHLY_BALANCE.passifs[i]));
  const monthlyRatio = DEMO_MONTHLY_BALANCE.actifs.map((a, i) => ratio(DEMO_MONTHLY_BALANCE.passifs[i], a));

  // Indicateurs patrimoniaux : consolidé (avec historique mensuel) ou entité choisie (mois précédent).
  const entity = scope === "all" ? null : DEMO_ENTITIES.find((e) => e.id === scope)!;
  const a = entity ? entity.actifs : actifsN;
  const p = entity ? entity.passifs : passifsN;
  const prevA = entity ? entity.prevActifs : DEMO_MONTHLY_BALANCE.actifs[last - 1];
  const prevP = entity ? entity.prevPassifs : DEMO_MONTHLY_BALANCE.passifs[last - 1];
  const ratioN = ratio(p, a);
  const ratioPrev = ratio(prevP, prevA);
  const ratioDelta = pointsBetween(ratioN, ratioPrev);
  const kpis = {
    totalActifs: amountMetric("actifs", "Total des actifs", a, prevA, "neutral", entity ? null : DEMO_MONTHLY_BALANCE.actifs),
    totalPassifs: amountMetric("passifs", "Total des passifs", p, prevP, "lower_is_better", entity ? null : DEMO_MONTHLY_BALANCE.passifs),
    capitauxPropres: amountMetric("capitaux", "Capitaux propres", sub(a, p), sub(prevA, prevP), "higher_is_better", entity ? null : monthlyCapitaux),
    ratioEndettement: {
      key: "endettement", label: "Ratio d'endettement", value: ratioN, previous: ratioPrev, deltaPoints: ratioDelta,
      tone: toneOf("lower_is_better", ratioDelta), series: entity ? null : monthlyRatio,
    } satisfies RatioMetric,
  };

  const assets = shares(DEMO_ASSET_GROUPS.map((g) => ({
    key: g.key, label: g.label, amount: sum(DEMO_BALANCE.actifs.filter((l) => l.group === g.key).map((l) => l.n)),
  })));

  const entities = DEMO_ENTITIES.map((e) => ({
    id: e.id, name: e.name, actifs: e.actifs, passifs: e.passifs, capitaux: sub(e.actifs, e.passifs),
    fondsRoulement: e.fondsRoulement, liquidite: e.liquidite.replace(".", ","), ratioEndettement: ratio(e.passifs, e.actifs),
  }));

  // Activité (compte de résultat) : consolidé uniquement dans la maquette.
  const act = DEMO_ACTIVITY;
  const ca = sum(act.chiffreAffaires);
  const resultat = sum(act.resultatNet);
  const charges = shares(act.chargesExploitation.map((c) => ({ key: c.key, label: c.label, amount: c.amount })));
  const cumulBeforeLast = sum(act.resultatNet.slice(0, -1));
  const marge = ratio(resultat, ca);
  const margeN1 = ratio(act.previousYear.resultatNet, act.previousYear.chiffreAffaires);
  const balanceLine = (k: string) => DEMO_BALANCE.actifs.concat(DEMO_BALANCE.passifs).find((l) => l.key === k)!;
  const tr = DEMO_TREASURY_MONTHS.values;
  const activity = {
    chiffreAffaires: amountMetric("ca", "Chiffre d'affaires", ca, act.previousYear.chiffreAffaires, "higher_is_better"),
    charges: amountMetric("charges", "Charges d'exploitation", charges.total, act.previousYear.chargesExploitation, "lower_is_better"),
    creancesClients: amountMetric("creances", "Créances clients", balanceLine("clients").n, balanceLine("clients").n1, "lower_is_better"),
    dettesFournisseurs: amountMetric("fournisseurs", "Dettes fournisseurs", balanceLine("fournisseurs").n, balanceLine("fournisseurs").n1, "neutral"),
    resultatNet: {
      value: resultat,
      /** Progression du cumul sur le dernier mois. */
      monthVariation: variation(resultat, cumulBeforeLast),
      tone: toneOf("higher_is_better", variation(resultat, cumulBeforeLast)?.amount ?? null),
      marge,
      margeN1,
      margeDeltaPoints: pointsBetween(marge, margeN1),
      target: DEMO_RESULT_TARGET,
      targetProgress: ratio(resultat, DEMO_RESULT_TARGET),
    },
    tresorerie: {
      ...amountMetric("tresorerie", "Trésorerie disponible", balanceLine("tresorerie").n, tr[tr.length - 2], "higher_is_better"),
      months: tr.map((v, i) => ({ label: DEMO_MONTHS_SHORT[DEMO_TREASURY_MONTHS.firstMonth - 1 + i], longLabel: `${DEMO_MONTHS_LONG[DEMO_TREASURY_MONTHS.firstMonth - 1 + i]} ${DEMO_FISCAL_YEAR}`, value: v })),
    },
    monthly: { ca: act.chiffreAffaires, resultat: act.resultatNet },
    chargesBreakdown: charges,
  };

  return {
    scope,
    scopeLabel: entity ? entity.name : "Toutes les entités",
    period: {
      fiscalYear: DEMO_FISCAL_YEAR,
      /** Situation à fin de période (mode Analyse) et cumul de l'exercice (mode Pilotage) : même période. */
      closingLabel: `Déc. ${DEMO_FISCAL_YEAR}`,
      closingLongLabel: `31 décembre ${DEMO_FISCAL_YEAR}`,
      previousClosingLabel: `Déc. ${DEMO_FISCAL_YEAR - 1}`,
      /** Comparaison des indicateurs de bilan : fin du mois précédent. */
      previousMonthLabel: `${DEMO_MONTHS_SHORT[last - 1]} ${DEMO_FISCAL_YEAR}`,
      cumulativeLabel: `Janv. ${DEMO_FISCAL_YEAR} – Déc. ${DEMO_FISCAL_YEAR}`,
      months: DEMO_MONTHS_SHORT,
      monthsLong: DEMO_MONTHS_LONG.map((m) => `${m} ${DEMO_FISCAL_YEAR}`),
    },
    kpis,
    monthlyBalance: { actifs: DEMO_MONTHLY_BALANCE.actifs, passifs: DEMO_MONTHLY_BALANCE.passifs },
    assets,
    entities,
    balanceDetail: { actifs: detail(DEMO_BALANCE.actifs), passifs: detail(DEMO_BALANCE.passifs), capitaux: detail(DEMO_BALANCE.capitaux) },
    capitauxConsolides: capitauxN,
    activity,
    operations: DEMO_OPERATIONS,
  };
}

export type DashboardModel = ReturnType<typeof buildDashboardModel>;
