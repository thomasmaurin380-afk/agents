import { normalizeLabel } from "./text";

export type ImportKind = "trial_balance" | "fec" | "bank_transactions";

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  trial_balance: "Balance comptable",
  fec: "Fichier des écritures comptables (FEC)",
  bank_transactions: "Relevé bancaire",
};

export type FieldDef = { key: string; label: string; required: boolean; synonyms: string[] };

export const TRIAL_BALANCE_FIELDS: FieldDef[] = [
  { key: "account_number", label: "N° de compte", required: true, synonyms: ["compte", "n compte", "no compte", "numero compte", "numero de compte", "num compte", "compte general", "comptenum", "code compte", "account", "compte num"] },
  { key: "account_label", label: "Libellé du compte", required: false, synonyms: ["libelle", "intitule", "libelle compte", "intitule compte", "intitule du compte", "libelle du compte", "comptelib", "designation", "nom du compte"] },
  { key: "opening_debit", label: "À-nouveau débit", required: false, synonyms: ["a nouveau debit", "an debit", "report debit", "solde ouverture debit", "solde initial debit", "ouverture debit"] },
  { key: "opening_credit", label: "À-nouveau crédit", required: false, synonyms: ["a nouveau credit", "an credit", "report credit", "solde ouverture credit", "solde initial credit", "ouverture credit"] },
  { key: "movement_debit", label: "Mouvements débit", required: false, synonyms: ["mouvement debit", "mouvements debit", "mvt debit", "mvts debit", "total debit", "cumul debit", "debit periode"] },
  { key: "movement_credit", label: "Mouvements crédit", required: false, synonyms: ["mouvement credit", "mouvements credit", "mvt credit", "mvts credit", "total credit", "cumul credit", "credit periode"] },
  { key: "closing_debit", label: "Solde débit", required: false, synonyms: ["solde debit", "solde debiteur", "soldes debit", "solde final debit", "sd", "debit solde"] },
  { key: "closing_credit", label: "Solde crédit", required: false, synonyms: ["solde credit", "solde crediteur", "soldes credit", "solde final credit", "sc", "credit solde"] },
  { key: "balance", label: "Solde (signé)", required: false, synonyms: ["solde", "solde net", "solde final", "solde de cloture", "balance"] },
  { key: "direction", label: "Sens du solde (D/C)", required: false, synonyms: ["sens", "sens solde", "d c"] },
];

export const BANK_FIELDS: FieldDef[] = [
  { key: "date", label: "Date d'opération", required: true, synonyms: ["date", "date operation", "date de l operation", "date comptable", "date d operation", "booking date", "date op"] },
  { key: "value_date", label: "Date de valeur", required: false, synonyms: ["date valeur", "date de valeur", "value date"] },
  { key: "label", label: "Libellé", required: true, synonyms: ["libelle", "libelle operation", "libelle de l operation", "description", "intitule", "detail", "libelle simplifie", "nature de l operation", "operation"] },
  { key: "amount", label: "Montant (signé)", required: false, synonyms: ["montant", "montant eur", "montant euros", "montant en euros", "amount", "somme"] },
  { key: "debit", label: "Débit (sortie)", required: false, synonyms: ["debit", "debit eur", "debit euros", "sortie", "sorties", "decaissement", "decaissements"] },
  { key: "credit", label: "Crédit (entrée)", required: false, synonyms: ["credit", "credit eur", "credit euros", "entree", "entrees", "encaissement", "encaissements"] },
  { key: "reference", label: "Référence", required: false, synonyms: ["reference", "ref", "numero", "n operation", "no operation", "reference operation"] },
  { key: "balance", label: "Solde après opération", required: false, synonyms: ["solde", "solde apres operation", "solde en euros", "balance"] },
];

/** Propose une colonne pour chaque champ d'après les en-têtes (correspondance exacte puis partielle). */
export function suggestColumns(fields: readonly FieldDef[], headers: readonly string[]): Record<string, number | null> {
  const norm = headers.map(normalizeLabel);
  const used = new Set<number>();
  const out: Record<string, number | null> = {};
  // 1) correspondances exactes
  for (const f of fields) {
    const idx = norm.findIndex((h, i) => !used.has(i) && f.synonyms.includes(h));
    out[f.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  // 2) correspondances partielles pour les champs restants (le synonyme le plus long gagne)
  for (const f of fields) {
    if (out[f.key] != null) continue;
    let best = -1;
    let bestLen = 0;
    norm.forEach((h, i) => {
      if (used.has(i) || h === "") return;
      for (const s of f.synonyms) {
        if (s.length > 3 && s.length > bestLen && (h.startsWith(s + " ") || h.endsWith(" " + s))) {
          best = i;
          bestLen = s.length;
        }
      }
    });
    out[f.key] = best >= 0 ? best : null;
    if (best >= 0) used.add(best);
  }
  return out;
}
