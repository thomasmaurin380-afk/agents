/**
 * Conversion stricte des montants. Aucun montant n'est deviné : en cas d'ambiguïté ou de plus de
 * deux décimales, la valeur est rejetée. Résultat : chaîne décimale normalisée (« -1234.56 »).
 */
export type DecimalSeparator = "," | ".";

export type AmountResult =
  | { ok: true; value: string; empty: false }
  | { ok: true; value: null; empty: true }
  | { ok: false; reason: string };

const SPACES = /[\s  ']/g;

/** Séparateur décimal d'une colonne, déduit de l'ensemble de ses valeurs. */
export function detectDecimalSeparator(values: readonly string[]): DecimalSeparator | null {
  let comma = 0;
  let dot = 0;
  for (const raw of values) {
    const v = raw.replace(SPACES, "").replace(/€/g, "");
    if (/\d,\d{1,2}\)?-?$/.test(v) && !/\d\.\d{1,2}\)?-?$/.test(v)) comma++;
    else if (/\d\.\d{1,2}\)?-?$/.test(v) && !/\d,\d{1,2}\)?-?$/.test(v)) {
      // « 1.234,56 » a déjà été compté ; « 1,234.56 » : point décimal.
      dot++;
    }
  }
  if (comma === 0 && dot === 0) return null;
  if (comma > 0 && dot > 0) return comma >= dot ? "," : ".";
  return comma > 0 ? "," : ".";
}

export function parseAmount(raw: string, decimal: DecimalSeparator | null): AmountResult {
  let v = raw.replace(SPACES, "").replace(/€|EUR/gi, "");
  if (v === "" || v === "-") return { ok: true, value: null, empty: true };

  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.endsWith("-")) {
    negative = !negative;
    v = v.slice(0, -1);
  }
  if (v.startsWith("-")) {
    negative = !negative;
    v = v.slice(1);
  } else if (v.startsWith("+")) v = v.slice(1);

  if (!/^[\d.,]+$/.test(v) || !/\d/.test(v)) return { ok: false, reason: `Montant illisible : « ${raw.trim()} »` };

  const thousands = decimal === "," ? "." : ",";
  let intPart = v;
  let decPart = "";
  if (decimal) {
    const idx = v.lastIndexOf(decimal);
    if (idx >= 0) {
      intPart = v.slice(0, idx);
      decPart = v.slice(idx + 1);
    }
    if (intPart.includes(decimal)) return { ok: false, reason: `Montant ambigu : « ${raw.trim()} »` };
    if (intPart.includes(thousands)) {
      if (!/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return { ok: false, reason: `Séparateur de milliers incohérent : « ${raw.trim()} »` };
      intPart = intPart.split(thousands).join("");
    }
  } else if (/[.,]/.test(v)) {
    return { ok: false, reason: `Montant ambigu (séparateur décimal inconnu) : « ${raw.trim()} »` };
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return { ok: false, reason: `Montant illisible : « ${raw.trim()} »` };
  if (decPart.length > 2) return { ok: false, reason: `Plus de deux décimales : « ${raw.trim()} »` };

  const normalizedInt = intPart.replace(/^0+(?=\d)/, "") || "0";
  const cents = decPart.padEnd(2, "0");
  const isZero = /^0+$/.test(normalizedInt) && /^0+$/.test(cents);
  return { ok: true, empty: false, value: `${negative && !isZero ? "-" : ""}${normalizedInt}.${cents}` };
}

/**
 * Valeur numérique d'une cellule XLSX (texte exact du fichier, ex. « 1234.5600000000001 »).
 * Les artefacts de virgule flottante (écart < 1e-6) sont arrondis au centime ; toute vraie
 * troisième décimale est rejetée.
 */
export function parseSpreadsheetNumber(raw: string): AmountResult {
  const m = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([-+]?\d+))?$/.exec(raw.trim());
  if (!m) return parseAmount(raw, detectDecimalSeparator([raw]));
  const [, sign, int, dec = "", exp] = m;
  let digits = int + dec;
  let point = int.length + (exp ? Number(exp) : 0);
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) digits = digits + "0".repeat(point - digits.length);
  const i = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  const d = digits.slice(point);
  if (d.length <= 2 || /^0*$/.test(d.slice(2))) {
    return { ok: true, empty: false, value: `${sign && !/^0*$/.test(i + d) ? "-" : ""}${i}.${d.slice(0, 2).padEnd(2, "0")}` };
  }
  // Artefact flottant : …99999x ou …00000x au-delà du centime.
  const tail = d.slice(2);
  if (/^0{5,}\d*$/.test(tail) || /^9{5,}\d*$/.test(tail)) {
    const scaled = BigInt(i + d.slice(0, 2)) + (tail.startsWith("9") ? 1n : 0n);
    const s = scaled.toString().padStart(3, "0");
    const value = `${s.slice(0, -2)}.${s.slice(-2)}`;
    return { ok: true, empty: false, value: `${sign && scaled !== 0n ? "-" : ""}${value}` };
  }
  return { ok: false, reason: `Plus de deux décimales : « ${raw.trim()} »` };
}

/** Somme exacte de montants décimaux normalisés (centimes entiers). */
export function sumAmounts(values: readonly (string | null)[]): string {
  let cents = 0n;
  for (const v of values) if (v) cents += toCents(v);
  return fromCents(cents);
}

export function toCents(v: string): bigint {
  const neg = v.startsWith("-");
  const [i, d = "00"] = (neg ? v.slice(1) : v).split(".");
  const c = BigInt(i) * 100n + BigInt(d.padEnd(2, "0").slice(0, 2));
  return neg ? -c : c;
}

export function fromCents(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const s = abs.toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Affichage français d'un montant normalisé : « 1 234,56 € ». */
export function formatAmountFr(v: string): string {
  const neg = v.startsWith("-");
  const [i, d = "00"] = (neg ? v.slice(1) : v).split(".");
  return `${neg ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")},${d.padEnd(2, "0")}\u00a0€`;
}
