import { decimalToCents } from "@/domain/sig/report";

/**
 * Présentation des montants et pourcentages du modèle (chaînes décimales exactes, jamais de
 * flottant). Espace fine insécable entre milliers, espace insécable avant l'unité, vrai signe
 * moins. Arrondi d'affichage : demi à l'écart de zéro.
 */
const NNBSP = " ";
const NBSP = " ";
const MINUS = "−";

const group = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);

/** Division entière arrondie demi à l'écart de zéro (diviseur positif). */
function divRound(n: bigint, d: bigint): bigint {
  const a = n < 0n ? -n : n;
  const q = (a * 2n + d) / (2n * d);
  return n < 0n ? -q : q;
}

/** « 4 451 508 € » (à l'euro). */
export function euros(value: string, { signed = false }: { signed?: boolean } = {}): string {
  const e = divRound(decimalToCents(value), 100n);
  const sign = e < 0n ? MINUS : signed && e > 0n ? "+" : "";
  return `${sign}${group(e < 0n ? -e : e)}${NBSP}€`;
}

/** « 4,45 M€ », « 523 k€ » : ordre de grandeur, pour un centre d'anneau ou un axe. */
export function compactEuros(value: string, digits: 0 | 1 | 2 = 2): string {
  const e = divRound(decimalToCents(value), 100n);
  const a = e < 0n ? -e : e;
  const sign = e < 0n ? MINUS : "";
  const scale = 10n ** BigInt(digits);
  if (a >= 1_000_000n) {
    const m = divRound(a * scale, 1_000_000n);
    return `${sign}${m / scale}${digits ? "," + (m % scale).toString().padStart(digits, "0") : ""}${NBSP}M€`;
  }
  if (a >= 1_000n) return `${sign}${group(divRound(a, 1_000n))}${NBSP}k€`;
  return `${sign}${a}${NBSP}€`;
}

/** Nombre décimal français (« 55,1 ») en pourcentage. */
export function percent(value: string | null, { signed = false }: { signed?: boolean } = {}): string {
  if (value == null) return "n.s.";
  const neg = value.startsWith("-");
  const abs = neg ? value.slice(1) : value;
  const zero = /^[0,]+$/.test(abs);
  return `${neg && !zero ? MINUS : signed && !zero ? "+" : ""}${abs}${NBSP}%`;
}

/** Écart en points de pourcentage (« −0,4 pt »). */
export function points(value: string | null): string {
  if (value == null) return "n.s.";
  const neg = value.startsWith("-");
  const abs = neg ? value.slice(1) : value;
  const zero = /^[0,]+$/.test(abs);
  // Pluriel à partir de 2 (« 0,4 pt », « 2,1 pts »).
  const plural = BigInt(abs.replace(",", "")) >= 20n;
  return `${neg && !zero ? MINUS : zero ? "" : "+"}${abs}${NBSP}pt${plural ? "s" : ""}`;
}

/** Valeur numérique approchée, réservée au tracé des graphiques (jamais affichée ni recalculée). */
export function plotValue(value: string): number {
  return Number(decimalToCents(value)) / 100;
}
