/**
 * Périodes d'analyse. Les mois sont énumérés à partir de la date d'ouverture de l'exercice
 * (exercices décalés gérés). Dates ISO « AAAA-MM-JJ », sans fuseau horaire.
 */
export type PeriodKind = "fiscal_year" | "ytd" | "month";

export type FiscalYearRef = { id: string; label: string; startDate: string; endDate: string };

export type Period = {
  kind: PeriodKind;
  fiscalYearId: string;
  /** Rang du mois dans l'exercice (1 = premier mois), sauf pour l'exercice complet. */
  month: number | null;
  start: string;
  end: string;
  label: string;
  /** Nombre de mois (entamés) couverts. */
  months: number;
};

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function parts(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(d: string, n: number): string {
  const { y, m, day } = parts(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function frDate(d: string): string {
  const { y, m, day } = parts(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Mois de l'exercice : bornés par les dates d'ouverture et de clôture. */
export function fiscalMonths(fy: Pick<FiscalYearRef, "startDate" | "endDate">) {
  const out: { month: number; start: string; end: string; label: string }[] = [];
  let { y, m } = parts(fy.startDate);
  let start = fy.startDate;
  for (let i = 1; start <= fy.endDate && i <= 24; i++) {
    const monthEnd = iso(y, m, lastDay(y, m));
    const end = monthEnd < fy.endDate ? monthEnd : fy.endDate;
    out.push({ month: i, start, end, label: `${MONTHS[m - 1]} ${y}` });
    m++;
    if (m > 12) { m = 1; y++; }
    start = iso(y, m, 1);
  }
  return out;
}

export function resolvePeriod(fy: FiscalYearRef, kind: PeriodKind, month: number | null): Period | null {
  const months = fiscalMonths(fy);
  if (kind === "fiscal_year") {
    return { kind, fiscalYearId: fy.id, month: null, start: fy.startDate, end: fy.endDate, label: `Exercice ${fy.label} (${frDate(fy.startDate)} – ${frDate(fy.endDate)})`, months: months.length };
  }
  const m = months.find((x) => x.month === month);
  if (!m) return null;
  if (kind === "month") {
    return { kind, fiscalYearId: fy.id, month: m.month, start: m.start, end: m.end, label: `Mois de ${m.label}`, months: 1 };
  }
  return { kind, fiscalYearId: fy.id, month: m.month, start: fy.startDate, end: m.end, label: `Cumul du ${frDate(fy.startDate)} au ${frDate(m.end)}`, months: m.month };
}

/** Exercice précédent : celui qui se termine la veille de l'ouverture de l'exercice courant. */
export function previousFiscalYear<T extends FiscalYearRef>(fy: FiscalYearRef, all: readonly T[]): T | null {
  const target = addDays(fy.startDate, -1);
  return all.find((x) => x.endDate === target) ?? null;
}

/** Période N-1 équivalente (même rang de mois), ou null si elle n'existe pas. */
export function comparisonPeriod(current: Period, previous: FiscalYearRef | null): Period | null {
  if (!previous) return null;
  return resolvePeriod(previous, current.kind, current.month);
}
