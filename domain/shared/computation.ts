/**
 * Résultat d'un calcul financier. Un montant manquant n'est JAMAIS remplacé par zéro :
 * le calcul renvoie « Données insuffisantes » avec les sources manquantes.
 */
export type DataSource =
  | "trial_balance"
  | "fec"
  | "bank_transactions"
  | "budget"
  | "invoices";

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  trial_balance: "Balance comptable",
  fec: "Fichier des écritures comptables (FEC)",
  bank_transactions: "Transactions bancaires",
  budget: "Budget",
  invoices: "Factures",
};

export type Computation<T> =
  | { status: "ok"; value: T; provisional: boolean; sources: DataSource[] }
  | { status: "insufficient_data"; missing: DataSource[]; reason?: string };

export function insufficientData(missing: DataSource[], reason?: string): Computation<never> {
  return { status: "insufficient_data", missing, reason };
}

export function describeMissing(c: Extract<Computation<unknown>, { status: "insufficient_data" }>): string {
  if (c.reason) return c.reason;
  const labels = c.missing.map((m) => DATA_SOURCE_LABELS[m]);
  return labels.length === 0
    ? "Données insuffisantes"
    : `Source manquante : ${labels.join(", ")}`;
}
