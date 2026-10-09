import { insufficientData, type Computation, type DataSource } from "@/domain/shared/computation";

/**
 * Indicateurs d'en-tête des tableaux de bord et sources qu'ils exigent.
 * `requires` = liste de groupes ; chaque groupe est satisfait par l'UNE de ses sources,
 * et tous les groupes doivent l'être (ex. CA : balance OU FEC).
 */
export const HEADLINE_INDICATORS = [
  { code: "revenue", label: "Chiffre d'affaires HT", requires: [["trial_balance", "fec"]] },
  { code: "ebitda", label: "Excédent brut d'exploitation", requires: [["trial_balance", "fec"]] },
  { code: "net_income", label: "Résultat net", requires: [["trial_balance", "fec"]] },
  { code: "cash", label: "Trésorerie disponible", requires: [["bank_transactions"]] },
  { code: "cash_in", label: "Encaissements", requires: [["bank_transactions"]] },
  { code: "budget_gap", label: "Écart au budget", requires: [["budget"], ["trial_balance", "fec"]] },
] as const satisfies readonly { code: string; label: string; requires: readonly (readonly DataSource[])[] }[];

export type HeadlineCode = (typeof HEADLINE_INDICATORS)[number]["code"];

/**
 * Disponibilité d'un indicateur au vu des sources importées. Ne calcule aucune valeur :
 * détermine seulement si le calcul est possible, sinon « Données insuffisantes » + sources manquantes.
 */
export function availability(
  requires: readonly (readonly DataSource[])[],
  available: ReadonlySet<DataSource>,
): Computation<"computable"> {
  const missingGroups = requires.filter((group) => !group.some((s) => available.has(s)));
  if (missingGroups.length > 0) return insufficientData(missingGroups.map((g) => g[0]));
  const used = requires.map((g) => g.find((s) => available.has(s))!) as DataSource[];
  return { status: "ok", value: "computable", provisional: false, sources: used };
}
