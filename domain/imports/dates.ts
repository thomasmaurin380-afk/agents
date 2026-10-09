/**
 * Conversion stricte des dates vers « AAAA-MM-JJ ». Formats acceptés : AAAAMMJJ (FEC),
 * JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, JJ/MM/AA, AAAA-MM-JJ, et dates natives (XLSX).
 * Ordre jour/mois : français par défaut ; « MM/JJ » uniquement si la colonne le prouve.
 */
export type DayMonthOrder = "dmy" | "mdy";

export type DateResult = { ok: true; value: string } | { ok: true; value: null } | { ok: false; reason: string };

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;

/** Ordre jour/mois d'une colonne : « mdy » seulement si une valeur a un 2e nombre > 12 et aucune un 1er > 12. */
export function detectDayMonthOrder(values: readonly string[]): DayMonthOrder {
  let firstAbove12 = false;
  let secondAbove12 = false;
  for (const v of values) {
    const m = SLASHED.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) firstAbove12 = true;
    if (Number(m[2]) > 12) secondAbove12 = true;
  }
  return secondAbove12 && !firstAbove12 ? "mdy" : "dmy";
}

export function parseDate(raw: string | Date | null | undefined, order: DayMonthOrder = "dmy"): DateResult {
  if (raw == null) return { ok: true, value: null };
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { ok: false, reason: "Date invalide" };
    return { ok: true, value: iso(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate())! };
  }
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m) {
    const r = iso(+m[1], +m[2], +m[3]);
    return r ? { ok: true, value: r } : { ok: false, reason: `Date invalide : « ${v} »` };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(v);
  if (m) {
    const r = iso(+m[1], +m[2], +m[3]);
    return r ? { ok: true, value: r } : { ok: false, reason: `Date invalide : « ${v} »` };
  }
  m = SLASHED.exec(v);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    let y = Number(m[3]);
    if (m[3].length === 2) y += y >= 70 ? 1900 : 2000;
    const r = order === "dmy" ? iso(y, b, a) : iso(y, a, b);
    return r ? { ok: true, value: r } : { ok: false, reason: `Date invalide : « ${v} »` };
  }
  return { ok: false, reason: `Format de date non reconnu : « ${v} »` };
}
