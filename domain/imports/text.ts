/**
 * Décodage d'un fichier texte : UTF-8 (avec ou sans BOM) si valide, sinon Windows-1252
 * (sur-ensemble d'ISO-8859-1, encodage courant des exports comptables français).
 */
export type DecodedText = { text: string; encoding: "utf-8" | "windows-1252" };

export function decodeText(bytes: Uint8Array): DecodedText {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), encoding: "windows-1252" };
  }
}

/** Normalise un en-tête ou un libellé pour la comparaison : minuscules, sans accents ni ponctuation. */
export function normalizeLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
