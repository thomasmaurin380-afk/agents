import "server-only";
import { readSheet } from "read-excel-file/node";
import { parseSpreadsheetNumber } from "@/domain/imports/amounts";
import { detectDelimiter, parseDelimited, type Delimiter } from "@/domain/imports/delimited";
import type { ImportKind } from "@/domain/imports/fields";
import type { RawCell, RawTable } from "@/domain/imports/table";
import { decodeText } from "@/domain/imports/text";

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500_000;

export class UnreadableFileError extends Error {}

function isZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
function isLegacyXls(bytes: Uint8Array) {
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

/** Lit un fichier importé (CSV/TXT/FEC ou XLSX) en tableau brut de cellules. Aucune conversion de valeur. */
export async function readTable(bytes: Uint8Array, kind: ImportKind): Promise<RawTable> {
  if (bytes.length === 0) throw new UnreadableFileError("Le fichier est vide.");
  if (bytes.length > MAX_IMPORT_BYTES) throw new UnreadableFileError("Fichier trop volumineux (20 Mo maximum).");
  if (isLegacyXls(bytes)) {
    throw new UnreadableFileError("Format Excel 97-2003 (.xls) non pris en charge : enregistrez le fichier en .xlsx ou en CSV.");
  }
  if (isZip(bytes)) {
    if (kind === "fec") throw new UnreadableFileError("Un FEC doit être un fichier texte (tabulation ou barre verticale), pas un classeur Excel.");
    return readXlsx(bytes);
  }
  const { text, encoding } = decodeText(bytes);
  if (text.includes("\u0000")) throw new UnreadableFileError("Fichier binaire non reconnu (CSV, TXT ou XLSX attendu).");
  let delimiter: Delimiter = detectDelimiter(text);
  if (kind === "fec") {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes("|") ? "|" : delimiter;
  }
  const rows = parseDelimited(text, delimiter);
  if (rows.length > MAX_IMPORT_ROWS) throw new UnreadableFileError(`Plus de ${MAX_IMPORT_ROWS} lignes : fichier trop volumineux.`);
  return { format: kind === "fec" ? "fec" : "csv", encoding, delimiter, rows };
}

async function readXlsx(bytes: Uint8Array): Promise<RawTable> {
  let data: unknown[][];
  try {
    // parseNumber : on récupère le texte exact du nombre (aucun passage par un flottant).
    data = (await readSheet(Buffer.from(bytes), { parseNumber: (s: string) => s, trim: false })) as unknown[][];
  } catch {
    throw new UnreadableFileError("Classeur Excel illisible ou protégé.");
  }
  if (data.length > MAX_IMPORT_ROWS) throw new UnreadableFileError(`Plus de ${MAX_IMPORT_ROWS} lignes : fichier trop volumineux.`);
  const rows: RawCell[][] = data.map((row) =>
    row.map((cell): RawCell => {
      if (cell == null) return null;
      if (cell instanceof Date) return cell;
      if (typeof cell === "boolean") return cell ? "VRAI" : "FAUX";
      const s = String(cell);
      // Nombre Excel : normalisé au centime si possible, sinon conservé tel quel (l'analyse le rejettera).
      if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) {
        const r = parseSpreadsheetNumber(s);
        return r.ok && r.value != null ? (/^-?\d+$/.test(s) ? s : r.value) : s;
      }
      return s;
    }),
  );
  return { format: "xlsx", sheet: "1", rows };
}
