import { formatAmountFr } from "@/domain/imports/amounts";
import { decimalToCents, percentOf, variation } from "@/domain/sig/report";

export const euro = (v: string) => formatAmountFr(v);

export function variationView(n: string, previous: string | null) {
  const v = variation(n, previous);
  if (!v) return null;
  return { amount: euro(v.amount), percent: v.percent ? `${v.percent.startsWith("-") ? "" : "+"}${v.percent} %` : "n.s." };
}

/** Part du chiffre d'affaires, seulement si le CA est strictement positif. */
export function shareOfRevenue(v: string, revenue: string | null) {
  if (!revenue) return null;
  const ca = decimalToCents(revenue);
  if (ca <= 0n) return null;
  const p = percentOf(decimalToCents(v), ca);
  return p ? `${p} %` : null;
}

export const PERIOD_KIND_LABELS = { fiscal_year: "Exercice complet", ytd: "Cumul depuis l'ouverture", month: "Mois isolé" } as const;
export const SOURCE_KIND_LABELS = { trial_balance: "Balance comptable", fec: "FEC" } as const;
export const SNAPSHOT_STATUS = {
  provisional: { label: "Provisoire", variant: "warning" },
  validated: { label: "Validé", variant: "default" },
  published: { label: "Publié", variant: "success" },
  obsolete: { label: "Obsolète", variant: "destructive" },
} as const;

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
export const fmtDateTime = (d: Date | string | null) => (d ? dateTime.format(new Date(d)) : "—");
