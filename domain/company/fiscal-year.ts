const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

/** Libellé d'un exercice selon son mois d'ouverture, ex. « 1er juillet → 30 juin ». */
export function fiscalYearLabel(startMonth: number): string {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new RangeError("Mois d'ouverture invalide");
  }
  if (startMonth === 1) return "Année civile (1er janvier → 31 décembre)";
  const endMonth = startMonth - 1; // 1..11
  const lastDay = new Date(Date.UTC(2001, endMonth, 0)).getUTCDate(); // année non bissextile
  return `Exercice décalé (1er ${MONTHS_FR[startMonth - 1]} → ${lastDay} ${MONTHS_FR[endMonth - 1]})`;
}
