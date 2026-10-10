import { formatAmountFr } from "@/domain/imports/amounts";

const AMOUNT = /^-?\d+\.\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Affichage d'une valeur de rapport : montants et dates au format français. */
export function displayValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  const s = String(v);
  if (AMOUNT.test(s)) return formatAmountFr(s);
  if (ISO_DATE.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return s;
}

export const IMPORT_STATUS_LABELS = {
  uploaded: "Reçu — à contrôler",
  mapped: "Correspondance enregistrée — à valider",
  committed: "Enregistré",
  superseded: "Remplacé",
  cancelled: "Annulé",
} as const;

/**
 * Sens des statuts. « Enregistré » = import techniquement validé (données contrôlées et stockées) ;
 * ce n'est PAS une validation métier par le DAF, qui portera sur les SIG et les rapports.
 */
export const IMPORT_STATUS_HELP = {
  uploaded: "Fichier reçu et conservé ; rien n'est encore enregistré dans les données.",
  mapped: "Correspondance des colonnes enregistrée ; les contrôles sont recalculés, rien n'est encore enregistré.",
  committed: "Données contrôlées et enregistrées (validation technique de l'import, pas une validation métier).",
  superseded: "Remplacé par une version plus récente ; conservé dans l'historique, il n'est plus utilisé.",
  cancelled: "Abandonné avant enregistrement ; aucune donnée n'a été enregistrée.",
} as const;

export const DATA_STATUS_LABELS = {
  provisional: "Situation provisoire",
  final: "Comptes définitifs",
} as const;

export const IMPORT_STATUS_VARIANTS = {
  uploaded: "warning",
  mapped: "warning",
  committed: "success",
  superseded: "secondary",
  cancelled: "outline",
} as const;
