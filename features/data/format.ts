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
  uploaded: "À vérifier",
  mapped: "À valider",
  committed: "Enregistré",
  superseded: "Remplacé",
  cancelled: "Annulé",
} as const;

export const IMPORT_STATUS_VARIANTS = {
  uploaded: "warning",
  mapped: "warning",
  committed: "success",
  superseded: "secondary",
  cancelled: "outline",
} as const;
