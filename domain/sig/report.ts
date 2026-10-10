import { createHash } from "node:crypto";
import type { SigComputation } from "./compute";
import type { Period } from "./periods";
import type { RuleSet, SigCheck, SourceKind } from "./types";

/** Empreinte d'un référentiel : toute modification de règle, formule ou hypothèse la change. */
export function rulesHash(rs: RuleSet): string {
  const { code, version, lines, aggregates, layout, rules, hypotheses } = rs;
  return sha256(JSON.stringify({ code, version, lines, aggregates, layout, rules, hypotheses }));
}

export function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Centimes → chaîne décimale exacte (« -1234.56 »). */
export function centsToDecimal(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

export function decimalToCents(s: string): bigint {
  const neg = s.startsWith("-");
  const [i, d = ""] = (neg ? s.slice(1) : s).split(".");
  const c = BigInt(i || "0") * 100n + BigInt((d + "00").slice(0, 2));
  return neg ? -c : c;
}

// ───────────── Choix de la source ─────────────

export type SourceAvailability = { available: true } | { available: false; reason: string };
export type SourceRequest = "auto" | SourceKind;

export type SourceDecision =
  | { ok: true; kind: SourceKind; choice: "auto" | "explicit"; justification: string | null; compareWith: SourceKind | null }
  | { ok: false; reason: string };

/**
 * Une seule source par calcul (jamais d'addition balance + FEC). En automatique, la balance est
 * préférée (elle reflète l'arrêté, écritures d'inventaire comprises) et le FEC sert de contrôle.
 * Un choix explicite alors que les deux sources existent exige une justification.
 */
export function decideSource(
  avail: Record<SourceKind, SourceAvailability>, request: SourceRequest, justification: string | null,
): SourceDecision {
  const both = avail.trial_balance.available && avail.fec.available;
  const reasons = [avail.trial_balance, avail.fec].map((a) => (a.available ? null : a.reason)).filter(Boolean).join(" ");
  if (request === "auto") {
    if (avail.trial_balance.available) return { ok: true, kind: "trial_balance", choice: "auto", justification: null, compareWith: both ? "fec" : null };
    if (avail.fec.available) return { ok: true, kind: "fec", choice: "auto", justification: null, compareWith: null };
    return { ok: false, reason: reasons || "Aucune source comptable pour cette période." };
  }
  const a = avail[request];
  if (!a.available) return { ok: false, reason: a.reason };
  if (!both) return { ok: true, kind: request, choice: "auto", justification: null, compareWith: null };
  const j = (justification ?? "").trim();
  if (j.length < 5) return { ok: false, reason: "Justifiez le choix de la source (au moins 5 caractères) : la balance et le FEC sont tous deux disponibles." };
  return { ok: true, kind: request, choice: "explicit", justification: j, compareWith: request === "fec" ? "trial_balance" : "fec" };
}

// ───────────── Contenu figé ─────────────

export type SnapshotContent = {
  format: 1;
  period: Pick<Period, "kind" | "month" | "start" | "end" | "label" | "months">;
  fiscalYear: { id: string; label: string; startDate: string; endDate: string };
  ruleSet: { code: string; version: number; label: string; hash: string };
  engineVersion: string;
  source: { kind: SourceKind; choice: "auto" | "explicit"; justification: string | null; refs: { importId: string; fileName: string | null; role: string }[]; provisional: boolean };
  comparison: { available: false; reason: string } | { available: true; period: Pick<Period, "start" | "end" | "label" | "months">; ruleSetCode: string; source: SourceKind };
  rows: {
    code: string; label: string; kind: "line" | "subtotal" | "solde"; level: number; value: string; previous: string | null;
    definition: string | null; clientExplanation: string | null;
    contributions: {
      account: string; label: string; pcgAccount: string; via: string; basis?: "pcg" | "cabinet" | "company"; overrideId: string | null; amount: string;
      debit: string | null; credit: string | null; importId: string; fileName: string | null; rows: number[] | null; entries: number | null;
      minus: { importId: string; fileName: string | null; rows: number[] | null } | null;
    }[];
  }[];
  reconciliation: { sigResult: string; accountingResult: string; gap: string };
  checks: { code: string; severity: string; title: string; explanation: string; amount: string | null; accounts: { account: string; label: string; amount: string; detail: string | null }[] }[];
};

export function serializeChecks(checks: readonly SigCheck[]): SnapshotContent["checks"] {
  return checks.map((c) => ({
    code: c.code, severity: c.severity, title: c.title, explanation: c.explanation,
    amount: c.amount === undefined ? null : centsToDecimal(c.amount),
    accounts: (c.accounts ?? []).map((a) => ({ account: a.account, label: a.label, amount: centsToDecimal(a.amount), detail: a.detail ?? null })),
  }));
}

export function serializeRows(rs: RuleSet, n: SigComputation, previous: SigComputation | null): SnapshotContent["rows"] {
  const prev = new Map(previous?.rows.map((r) => [r.code, r.value]) ?? []);
  const agg = new Map(rs.aggregates.map((a) => [a.code as string, a]));
  return n.rows.map((r) => ({
    code: r.code, label: r.label, kind: r.kind, level: r.level, value: centsToDecimal(r.value),
    previous: previous ? centsToDecimal(prev.get(r.code) ?? 0n) : null,
    definition: agg.get(r.code)?.definition ?? null,
    clientExplanation: agg.get(r.code)?.clientExplanation ?? null,
    contributions: r.contributions.map((c) => ({
      account: c.account, label: c.label, pcgAccount: c.pcgAccount,
      via: c.via.kind === "rule"
        ? `${c.via.basis === "cabinet" ? "Convention du cabinet" : "Règle PCG"} ${c.via.prefix}${c.via.note ? ` — ${c.via.note}` : ""}`
        : `Exception de l'entreprise : ${c.via.justification}`,
      basis: c.via.kind === "rule" ? c.via.basis : "company",
      overrideId: c.via.kind === "override" ? c.via.overrideId : null,
      amount: centsToDecimal(c.amount),
      debit: c.debit == null ? null : centsToDecimal(c.debit), credit: c.credit == null ? null : centsToDecimal(c.credit),
      importId: c.origin.importId, fileName: c.origin.fileName, rows: c.origin.rows ?? null, entries: c.origin.entries ?? null,
      minus: c.origin.minus ? { importId: c.origin.minus.importId, fileName: c.origin.minus.fileName, rows: c.origin.minus.rows ?? null } : null,
    })),
  }));
}

/** JSON canonique (clés triées) : l'empreinte ne dépend pas de l'ordre des clés stocké par jsonb. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** Empreinte d'intégrité du contenu figé. */
export function contentHash(content: SnapshotContent): string {
  return sha256(canonicalJson(content));
}

/** Variation N / N-1 : en euros toujours ; en % seulement si N-1 est non nul. */
export function variation(n: string, previous: string | null): { amount: string; percent: string | null } | null {
  if (previous == null) return null;
  const a = decimalToCents(n);
  const b = decimalToCents(previous);
  const diff = a - b;
  return { amount: centsToDecimal(diff), percent: percentOf(diff, b) };
}

/** num / |den| en %, arrondi au dixième (entiers uniquement) ; null si den = 0. */
export function percentOf(num: bigint, den: bigint): string | null {
  if (den === 0n) return null;
  const d = den < 0n ? -den : den;
  const tenths = (num * 1000n * 2n + (num >= 0n ? d : -d)) / (2n * d);
  const neg = tenths < 0n;
  const t = neg ? -tenths : tenths;
  return `${neg ? "-" : ""}${t / 10n},${t % 10n}`;
}
