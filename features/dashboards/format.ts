const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NUM1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NUM2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const eur = (v: number) => EUR.format(v);
export const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${EUR.format(Math.abs(v))}`;
export const pct = (v: number) => PCT.format(v);
export const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${PCT.format(Math.abs(v))}`;
export const pts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${NUM1.format(Math.abs(v))} pts`;
export const meur = (v: number) => `${NUM2.format(v / 1_000_000)} M€`;
export const direction = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "flat") as "up" | "down" | "flat";
