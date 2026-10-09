import { formatAmountFr as fr, fromCents, sumAmounts, toCents } from "./amounts";
import { normalizeAccountNumber } from "./accounts";
import { ColumnReader, dataRows } from "./column-reader";
import { error, warning, type ImportIssue } from "./issues";
import { headersAt, type RawTable } from "./table";

/**
 * Fichier des écritures comptables (art. A47 A-1 du LPF) : 18 colonnes, séparateur tabulation
 * ou barre verticale, dates AAAAMMJJ. Variante admise : « Montant » + « Sens » au lieu de
 * « Debit » + « Credit ».
 */
export const FEC_COMMON = [
  "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib",
  "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib",
] as const;
export const FEC_TAIL = ["EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"] as const;

export type FecVariant = "debit_credit" | "amount_direction";

export type FecLine = {
  sourceRow: number;
  journalCode: string;
  journalLabel: string;
  entryNumber: string;
  entryDate: string;
  accountNumber: string;
  accountLabel: string;
  auxAccount: string | null;
  auxLabel: string | null;
  pieceRef: string;
  pieceDate: string | null;
  label: string;
  debit: string;
  credit: string;
  lettering: string | null;
  letteringDate: string | null;
  validationDate: string | null;
  currencyAmount: string | null;
  currency: string | null;
};

export type FecAnalysis = {
  variant: FecVariant | null;
  lines: FecLine[];
  issues: ImportIssue[];
  totals: { debit: string; credit: string };
  entryCount: number;
  unvalidatedLines: number;
  period: { first: string | null; last: string | null };
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Position de chaque colonne FEC dans l'en-tête, ou null si l'en-tête n'est pas un FEC. */
export function locateFecColumns(headers: readonly string[]): { variant: FecVariant; index: Record<string, number>; extra: string[] } | null {
  const pos = new Map(headers.map((h, i) => [key(h), i] as const));
  const need = (names: readonly string[]) => names.every((n) => pos.has(key(n)));
  let variant: FecVariant | null = null;
  if (need([...FEC_COMMON, "Debit", "Credit", ...FEC_TAIL])) variant = "debit_credit";
  else if (need([...FEC_COMMON, "Montant", "Sens", ...FEC_TAIL])) variant = "amount_direction";
  if (!variant) return null;
  const names = [...FEC_COMMON, ...(variant === "debit_credit" ? ["Debit", "Credit"] : ["Montant", "Sens"]), ...FEC_TAIL];
  const index: Record<string, number> = {};
  for (const n of names) index[n] = pos.get(key(n))!;
  const known = new Set(names.map(key));
  return { variant, index, extra: headers.filter((h) => h.trim() !== "" && !known.has(key(h))) };
}

export type FecContext = {
  fiscalYear: { startDate: string; endDate: string };
  fileName: string;
  companySiren: string | null;
};

export function analyzeFec(table: RawTable, ctx: FecContext): FecAnalysis {
  const issues: ImportIssue[] = [];
  const lines: FecLine[] = [];
  const empty: FecAnalysis = {
    variant: null, lines, issues, totals: { debit: "0.00", credit: "0.00" }, entryCount: 0, unvalidatedLines: 0,
    period: { first: null, last: null },
  };
  const located = locateFecColumns(headersAt(table.rows, 0));
  if (!located) {
    issues.push(error("not_fec", "En-tête FEC introuvable : les 18 colonnes réglementaires (JournalCode … Idevise) sont attendues en première ligne"));
    return empty;
  }
  const { variant, index: ix, extra } = located;
  if (extra.length > 0) issues.push(warning("extra_columns", `Colonnes supplémentaires ignorées : ${extra.join(", ")}`));

  const name = /^(\d{9})FEC(\d{8})/i.exec(ctx.fileName);
  if (!name) {
    issues.push(warning("file_name", "Nom de fichier non conforme au format SIRENFECAAAAMMJJ"));
  } else {
    if (ctx.companySiren && name[1] !== ctx.companySiren) {
      issues.push(warning("siren_mismatch", `Le SIREN du nom de fichier (${name[1]}) diffère de celui de l'entreprise (${ctx.companySiren})`));
    }
    const closing = `${name[2].slice(0, 4)}-${name[2].slice(4, 6)}-${name[2].slice(6, 8)}`;
    if (closing !== ctx.fiscalYear.endDate) {
      issues.push(warning("closing_mismatch", `La date de clôture du nom de fichier (${closing}) diffère de la fin de l'exercice choisi (${ctx.fiscalYear.endDate})`));
    }
  }

  const rows = dataRows(table, 0);
  const reader = new ColumnReader(rows);
  const entries = new Map<string, { debit: bigint; credit: bigint; firstRow: number }>();
  let unvalidated = 0;
  let first: string | null = null;
  let last: string | null = null;

  for (const row of rows) {
    const t = (n: string) => reader.text(row, ix[n]);
    const rowIssues: ImportIssue[] = [];
    const req = (n: string, label: string) => {
      const v = t(n);
      if (v === "") rowIssues.push(error("missing_field", `${label} manquant (${n})`, row.rowNumber, n));
      return v;
    };
    const journalCode = req("JournalCode", "Code journal");
    const entryNumber = req("EcritureNum", "Numéro d'écriture");
    const rawAccount = req("CompteNum", "Numéro de compte");
    const date = reader.date(row, ix.EcritureDate);
    if (!date.ok || date.value == null) {
      rowIssues.push(error("invalid_date", date.ok ? "Date d'écriture manquante" : date.reason, row.rowNumber, "EcritureDate"));
    }
    const pieceDate = reader.date(row, ix.PieceDate);
    if (!pieceDate.ok) rowIssues.push(warning("invalid_piece_date", pieceDate.reason, row.rowNumber, "PieceDate"));
    const validDate = reader.date(row, ix.ValidDate);
    if (!validDate.ok) rowIssues.push(warning("invalid_valid_date", validDate.reason, row.rowNumber, "ValidDate"));
    const letDate = reader.date(row, ix.DateLet);

    let debit = "0.00";
    let credit = "0.00";
    if (variant === "debit_credit") {
      const d = reader.amount(row, ix.Debit);
      const c = reader.amount(row, ix.Credit);
      if (!d.ok) rowIssues.push(error("invalid_amount", d.reason, row.rowNumber, "Debit"));
      if (!c.ok) rowIssues.push(error("invalid_amount", c.reason, row.rowNumber, "Credit"));
      if (d.ok && c.ok) {
        debit = d.value ?? "0.00";
        credit = c.value ?? "0.00";
      }
    } else {
      const m = reader.amount(row, ix.Montant);
      const sens = t("Sens").toUpperCase();
      if (!m.ok) rowIssues.push(error("invalid_amount", m.reason, row.rowNumber, "Montant"));
      else if (sens === "D" || sens === "+1") debit = m.value ?? "0.00";
      else if (sens === "C" || sens === "-1") credit = m.value ?? "0.00";
      else rowIssues.push(error("invalid_direction", `Sens non reconnu : « ${sens} » (D/C ou +1/-1 attendu)`, row.rowNumber, "Sens"));
    }
    if (debit.startsWith("-") || credit.startsWith("-")) {
      rowIssues.push(warning("negative_amount", "Montant négatif (le FEC attend des montants positifs)", row.rowNumber));
    }
    if (toCents(debit) !== 0n && toCents(credit) !== 0n) {
      rowIssues.push(error("both_sides", "Ligne à la fois au débit et au crédit", row.rowNumber));
    }
    if (date.ok && date.value && (date.value < ctx.fiscalYear.startDate || date.value > ctx.fiscalYear.endDate)) {
      rowIssues.push(error("out_of_fiscal_year", `Date ${date.value} hors de l'exercice (${ctx.fiscalYear.startDate} → ${ctx.fiscalYear.endDate})`, row.rowNumber, "EcritureDate"));
    }
    if (t("EcritureLib") === "") rowIssues.push(warning("missing_label", "Libellé d'écriture vide", row.rowNumber, "EcritureLib"));

    issues.push(...rowIssues);
    if (rowIssues.some((i) => i.severity === "error")) continue;
    if (!validDate.ok || validDate.value == null) unvalidated++;

    const entryDate = (date as { value: string }).value;
    if (!first || entryDate < first) first = entryDate;
    if (!last || entryDate > last) last = entryDate;
    const k = `${journalCode}\u0000${entryNumber}`;
    const e = entries.get(k) ?? { debit: 0n, credit: 0n, firstRow: row.rowNumber };
    e.debit += toCents(debit);
    e.credit += toCents(credit);
    entries.set(k, e);

    const cur = reader.amount(row, ix.Montantdevise);
    lines.push({
      sourceRow: row.rowNumber,
      journalCode,
      journalLabel: t("JournalLib"),
      entryNumber,
      entryDate,
      accountNumber: normalizeAccountNumber(rawAccount),
      accountLabel: t("CompteLib"),
      auxAccount: t("CompAuxNum") || null,
      auxLabel: t("CompAuxLib") || null,
      pieceRef: t("PieceRef"),
      pieceDate: pieceDate.ok ? pieceDate.value : null,
      label: t("EcritureLib"),
      debit,
      credit,
      lettering: t("EcritureLet") || null,
      letteringDate: letDate.ok ? letDate.value : null,
      validationDate: validDate.ok ? validDate.value : null,
      currencyAmount: cur.ok ? cur.value : null,
      currency: t("Idevise") || null,
    });
  }

  for (const [k, e] of entries) {
    if (e.debit !== e.credit) {
      const [journal, num] = k.split("\u0000");
      issues.push(
        error("unbalanced_entry", `Écriture ${num} (journal ${journal}) déséquilibrée : débit ${fr(fromCents(e.debit))} ≠ crédit ${fr(fromCents(e.credit))}`, e.firstRow),
      );
    }
  }
  const totals = { debit: sumAmounts(lines.map((l) => l.debit)), credit: sumAmounts(lines.map((l) => l.credit)) };
  if (totals.debit !== totals.credit) {
    issues.push(error("unbalanced", `FEC déséquilibré : total débit ${fr(totals.debit)} ≠ total crédit ${fr(totals.credit)}`));
  }
  if (rows.length === 0) issues.push(error("empty", "Le FEC ne contient aucune écriture"));
  if (unvalidated > 0) {
    issues.push(warning("unvalidated", `${unvalidated} ligne(s) sans date de validation : données provisoires`));
  }
  return { variant, lines, issues, totals, entryCount: entries.size, unvalidatedLines: unvalidated, period: { first, last } };
}
