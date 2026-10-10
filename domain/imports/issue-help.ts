import type { ImportIssue } from "./issues";

/** Catégorie d'affichage : les doublons ignorés ne sont ni des erreurs ni de simples avertissements. */
export type IssueCategory = "error" | "warning" | "duplicate";

const DUPLICATE_CODES = new Set(["duplicates", "nothing_new", "duplicate", "missing_known"]);

export function issueCategory(i: ImportIssue): IssueCategory {
  if (i.severity === "error") return "error";
  return DUPLICATE_CODES.has(i.code) ? "duplicate" : "warning";
}

/** Ce qui est attendu, en langage simple, pour corriger l'anomalie. */
export const ISSUE_HINTS: Record<string, string> = {
  invalid_amount: "Montant attendu, par exemple 1 234,56 ou -1234.56 (deux décimales au plus).",
  missing_amount: "Chaque opération doit avoir un montant (colonne Montant, ou Débit / Crédit).",
  both_sides: "Une seule des deux colonnes (débit ou crédit) doit être renseignée sur une ligne.",
  negative_balance_column: "Les colonnes de solde débit / crédit contiennent des montants positifs ; sinon choisissez le mode « solde signé ».",
  invalid_direction: "Sens attendu : D ou C (Débit / Crédit), +1 ou -1.",
  negative_with_direction: "Avec une colonne de sens, le solde doit être positif.",
  invalid_date: "Date attendue : JJ/MM/AAAA, AAAA-MM-JJ ou AAAAMMJJ.",
  invalid_account: "Numéro de compte attendu : chiffres et lettres, sans caractères spéciaux.",
  duplicate_account: "Chaque compte ne doit apparaître qu'une fois dans la balance.",
  unbalanced: "Total des soldes débiteurs = total des soldes créditeurs. Vérifiez qu'aucune ligne ne manque.",
  unbalanced_movements: "Total des mouvements débit = total des mouvements crédit.",
  unbalanced_entry: "Chaque écriture (même journal et même numéro) doit être équilibrée.",
  out_of_fiscal_year: "La date doit appartenir à l'exercice choisi ; sinon choisissez le bon exercice.",
  missing_field: "Cette colonne obligatoire du FEC doit être renseignée.",
  not_fec: "Fichier FEC attendu : 18 colonnes réglementaires, première ligne d'en-tête (JournalCode … Idevise).",
  mapping_incomplete: "Associez la colonne manquante dans « Correspondance des colonnes », puis « Appliquer et recontrôler ».",
  empty: "Le fichier ne contient aucune ligne exploitable avec la correspondance actuelle.",
  ignored_line: "Ligne de titre ou de total : ignorée, rien à faire.",
  line_inconsistent: "À-nouveau + mouvements devraient égaler le solde de la ligne.",
  sign_mismatch: "Un montant négatif dans une colonne Débit ou Crédit est inhabituel : vérifiez le sens de l'opération.",
  zero_amount: "Opération de montant nul : vérifiez qu'elle est utile.",
  balance_break: "Des opérations manquent peut-être entre deux lignes (solde après opération discontinu).",
  template_incompatible: "Vérifiez la correspondance proposée : le modèle mémorisé ne s'appliquait plus à ce fichier.",
  missing_known: "Des opérations déjà enregistrées sur la période ne figurent pas dans ce fichier : elles sont conservées. Vérifiez une éventuelle correction de la banque.",
  supersedes: "Cochez la confirmation de remplacement au moment de la validation.",
  file_name: "Nom réglementaire : SIRENFECAAAAMMJJ (sans incidence sur l'import).",
  unvalidated: "Écritures sans date de validation : la situation est provisoire.",
};

/** Libellé de colonne pour un champ (correspondance) ou un nom de colonne FEC. */
export function columnLabel(field: string, headers: readonly string[], columns?: Record<string, number | null | undefined>): string | undefined {
  let idx: number | null | undefined = columns?.[field];
  if (idx == null) {
    const key = field.toLowerCase().replace(/[^a-z]/g, "");
    const found = headers.findIndex((h) => h.toLowerCase().replace(/[^a-z]/g, "") === key);
    idx = found >= 0 ? found : null;
  }
  if (idx == null) return undefined;
  const h = headers[idx];
  return `col. ${idx + 1}${h ? ` « ${h} »` : ""}`;
}

/** Ajoute la colonne concernée à chaque anomalie portant sur un champ. */
export function withColumns(
  issues: readonly ImportIssue[],
  headers: readonly string[],
  columns?: Record<string, number | null | undefined>,
): ImportIssue[] {
  return issues.map((i) => (i.field ? { ...i, column: columnLabel(i.field, headers, columns) } : i));
}
