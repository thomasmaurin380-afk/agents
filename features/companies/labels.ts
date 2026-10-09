export const COMPANY_STATUS_LABELS = {
  onboarding: "Intégration",
  active: "Active",
  paused: "En pause",
  archived: "Archivée",
} as const;

export const COMPANY_STATUS_VARIANTS = {
  onboarding: "warning",
  active: "success",
  paused: "secondary",
  archived: "outline",
} as const;

export const MONTH_OPTIONS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
].map((label, i) => ({ value: i + 1, label }));
