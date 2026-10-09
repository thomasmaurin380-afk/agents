/** Lecture de fichiers délimités (CSV, TXT, FEC) conforme RFC 4180 (guillemets, retours ligne échappés). */

export type Delimiter = ";" | "," | "\t" | "|";
const CANDIDATES: Delimiter[] = [";", "\t", "|", ","];

/** Choisit le séparateur le plus régulier sur les premières lignes (hors guillemets). */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 30);
  let best: Delimiter = ";";
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    // Score : lignes ayant le nombre de séparateurs le plus fréquent, pondéré par ce nombre.
    const freq = new Map<number, number>();
    for (const c of nonZero) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [mode, modeCount] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = modeCount * 1000 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === d && !inQuotes) n++;
  }
  return n;
}

/** Découpe le texte en lignes de cellules (chaînes brutes, non converties). */
export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
