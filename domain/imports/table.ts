import { normalizeLabel } from "./text";

/**
 * Tableau brut, indépendant du format source. `rows` contient TOUTES les lignes du fichier
 * (y compris titres et en-tête) ; `rowNumber(i)` = numéro de ligne affiché à l'utilisateur.
 */
export type RawCell = string | Date | null;

export type RawTable = {
  format: "csv" | "xlsx" | "fec";
  encoding?: string;
  delimiter?: string;
  sheet?: string;
  rows: RawCell[][];
};

export function cellText(c: RawCell | undefined): string {
  if (c == null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return c.trim();
}

export function isBlankRow(row: readonly RawCell[]): boolean {
  return row.every((c) => cellText(c) === "");
}

const NUMERIC = /^[-+(]?[\d\s.,  ]+[)-]?\s*€?$/;

/**
 * Détecte la ligne d'en-tête parmi les 30 premières : première ligne majoritairement textuelle
 * comportant au moins la moitié du nombre maximal de cellules renseignées.
 */
export function detectHeaderRow(rows: readonly RawCell[][]): number {
  const head = rows.slice(0, 30);
  const filled = head.map((r) => r.filter((c) => cellText(c) !== "").length);
  const max = Math.max(0, ...filled);
  for (let i = 0; i < head.length; i++) {
    const cells = head[i].map(cellText).filter((t) => t !== "");
    if (cells.length < 2 || cells.length < max / 2) continue;
    const textual = cells.filter((t) => !NUMERIC.test(t) && !/^\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t));
    if (textual.length >= cells.length * 0.6) return i;
  }
  return 0;
}

export function headersAt(rows: readonly RawCell[][], headerRow: number): string[] {
  return (rows[headerRow] ?? []).map(cellText);
}

/** Empreinte d'un jeu d'en-têtes (réutilisation des modèles de correspondance). */
export function headerSignature(headers: readonly string[]): string {
  return headers.map(normalizeLabel).join("|");
}
