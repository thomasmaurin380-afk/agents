import { fromCents, sumAmounts, toCents } from "./amounts";
import { ColumnReader, dataRows } from "./column-reader";
import { error, warning, type ImportIssue } from "./issues";
import type { RawTable } from "./table";
import { normalizeLabel } from "./text";

export type BankAmountMode = "signed" | "debit_credit";

export type BankMapping = {
  headerRow: number;
  amountMode: BankAmountMode;
  columns: Partial<Record<"date" | "value_date" | "label" | "amount" | "debit" | "credit" | "reference" | "balance", number | null>>;
};

/** Sens d'une opération : ce n'est pas une catégorie (la catégorisation relève de règles explicites). */
export type FlowDirection = "inflow" | "outflow" | "to_review";

export const FLOW_DIRECTION_LABELS: Record<FlowDirection, string> = {
  inflow: "Encaissement",
  outflow: "Décaissement",
  to_review: "À vérifier",
};

export type BankLine = {
  sourceRow: number;
  direction: FlowDirection;
  /** Motif lorsque le sens doit être vérifié (montant nul, signe incohérent avec sa colonne). */
  reviewReason: string | null;
  bookingDate: string;
  valueDate: string | null;
  amount: string;
  label: string;
  labelNormalized: string;
  reference: string | null;
  balanceAfter: string | null;
  /** Clé naturelle (avant hachage) : sert à détecter les doublons entre imports successifs. */
  naturalKey: string;
};

export type BankAnalysis = {
  lines: BankLine[];
  issues: ImportIssue[];
  totals: {
    inflows: string; outflows: string; net: string; first: string | null; last: string | null;
    inflowCount: number; outflowCount: number; toReviewCount: number;
  };
  runningBalance: { status: "consistent" | "inconsistent" | "not_available"; closing: string | null; closingDate: string | null };
};

export function bankMappingErrors(m: BankMapping): string[] {
  const c = m.columns;
  const errs: string[] = [];
  if (c.date == null) errs.push("La colonne « Date d'opération » est obligatoire.");
  if (c.label == null) errs.push("La colonne « Libellé » est obligatoire.");
  if (m.amountMode === "signed" && c.amount == null) errs.push("Mode montant signé : la colonne « Montant » est obligatoire.");
  if (m.amountMode === "debit_credit" && (c.debit == null || c.credit == null)) {
    errs.push("Mode débit/crédit : les colonnes « Débit » et « Crédit » sont obligatoires.");
  }
  return errs;
}

export function analyzeBank(table: RawTable, mapping: BankMapping): BankAnalysis {
  const issues: ImportIssue[] = [];
  const lines: BankLine[] = [];
  const base: BankAnalysis = {
    lines, issues,
    totals: { inflows: "0.00", outflows: "0.00", net: "0.00", first: null, last: null, inflowCount: 0, outflowCount: 0, toReviewCount: 0 },
    runningBalance: { status: "not_available", closing: null, closingDate: null },
  };
  const mErr = bankMappingErrors(mapping);
  if (mErr.length > 0) {
    issues.push(...mErr.map((m) => error("mapping_incomplete", m)));
    return base;
  }
  const c = mapping.columns;
  const rows = dataRows(table, mapping.headerRow);
  const reader = new ColumnReader(rows);
  const occurrences = new Map<string, number>();

  for (const row of rows) {
    const rowIssues: ImportIssue[] = [];
    const date = reader.date(row, c.date);
    if (!date.ok || date.value == null) {
      rowIssues.push(error("invalid_date", date.ok ? "Date d'opération manquante" : date.reason, row.rowNumber, "date"));
    }
    const valueDate = reader.date(row, c.value_date);
    if (!valueDate.ok) rowIssues.push(warning("invalid_value_date", valueDate.reason, row.rowNumber, "value_date"));
    const label = reader.text(row, c.label);
    if (label === "") rowIssues.push(warning("missing_label", "Libellé vide", row.rowNumber, "label"));

    let amount: string | null = null;
    let reviewReason: string | null = null;
    if (mapping.amountMode === "signed") {
      const a = reader.amount(row, c.amount);
      if (!a.ok) rowIssues.push(error("invalid_amount", a.reason, row.rowNumber, "amount"));
      else if (a.value == null) rowIssues.push(error("missing_amount", "Montant manquant", row.rowNumber, "amount"));
      else amount = a.value;
    } else {
      const d = reader.amount(row, c.debit);
      const cr = reader.amount(row, c.credit);
      if (!d.ok) rowIssues.push(error("invalid_amount", d.reason, row.rowNumber, "debit"));
      if (!cr.ok) rowIssues.push(error("invalid_amount", cr.reason, row.rowNumber, "credit"));
      if (d.ok && cr.ok) {
        const dv = d.value && toCents(d.value) !== 0n ? d.value.replace(/^-/, "") : null;
        const cv = cr.value && toCents(cr.value) !== 0n ? cr.value.replace(/^-/, "") : null;
        // Un montant négatif dans une colonne Débit ou Crédit contredit le sens de la colonne :
        // on applique la convention de la colonne mais l'opération est signalée à vérifier.
        if ((dv && d.value!.startsWith("-")) || (cv && cr.value!.startsWith("-"))) {
          reviewReason = `Montant négatif dans la colonne ${dv ? "Débit" : "Crédit"} : sens à confirmer`;
          rowIssues.push(warning("sign_mismatch", reviewReason, row.rowNumber, dv ? "debit" : "credit"));
        }
        if (dv && cv) rowIssues.push(error("both_sides", "Montant à la fois au débit et au crédit", row.rowNumber));
        else if (dv) amount = `-${dv}`;
        else if (cv) amount = cv;
        else if (d.value || cr.value) amount = "0.00";
        else rowIssues.push(error("missing_amount", "Montant manquant (débit et crédit vides)", row.rowNumber));
      }
    }
    if (amount != null && toCents(amount) === 0n) {
      reviewReason = "Montant nul";
      rowIssues.push(warning("zero_amount", "Opération de montant nul : sens à vérifier", row.rowNumber));
    }

    let balanceAfter: string | null = null;
    if (c.balance != null) {
      const b = reader.amount(row, c.balance);
      if (!b.ok) rowIssues.push(warning("invalid_balance", b.reason, row.rowNumber, "balance"));
      else balanceAfter = b.value;
    }

    issues.push(...rowIssues);
    if (rowIssues.some((i) => i.severity === "error") || amount == null) continue;

    const reference = reader.text(row, c.reference) || null;
    const labelNormalized = normalizeLabel(label);
    const keyBase = `${date.ok ? date.value : ""}|${amount}|${labelNormalized}|${reference ?? ""}`;
    const n = (occurrences.get(keyBase) ?? 0) + 1;
    occurrences.set(keyBase, n);
    const cents = toCents(amount);
    lines.push({
      sourceRow: row.rowNumber,
      direction: reviewReason ? "to_review" : cents > 0n ? "inflow" : "outflow",
      reviewReason,
      bookingDate: (date as { value: string }).value,
      valueDate: valueDate.ok ? valueDate.value : null,
      amount,
      label,
      labelNormalized,
      reference,
      balanceAfter,
      naturalKey: `${keyBase}#${n}`,
    });
  }

  if (rows.length === 0) issues.push(error("empty", "Aucune opération dans le fichier"));
  const inflows = sumAmounts(lines.filter((l) => !l.amount.startsWith("-")).map((l) => l.amount));
  const outflows = sumAmounts(lines.filter((l) => l.amount.startsWith("-")).map((l) => l.amount));
  const dates = lines.map((l) => l.bookingDate).sort();
  base.totals = {
    inflows,
    outflows,
    net: fromCents(toCents(inflows) + toCents(outflows)),
    first: dates[0] ?? null,
    last: dates.at(-1) ?? null,
    inflowCount: lines.filter((l) => l.direction === "inflow").length,
    outflowCount: lines.filter((l) => l.direction === "outflow").length,
    toReviewCount: lines.filter((l) => l.direction === "to_review").length,
  };
  base.runningBalance = checkRunningBalance(lines, issues);
  return base;
}

/**
 * Contrôle du solde après opération : chaque solde doit égaler le précédent + le montant,
 * le fichier pouvant être trié du plus ancien au plus récent ou l'inverse.
 */
function checkRunningBalance(lines: readonly BankLine[], issues: ImportIssue[]): BankAnalysis["runningBalance"] {
  const withBalance = lines.filter((l) => l.balanceAfter != null);
  if (withBalance.length < 2 || withBalance.length !== lines.length) {
    return { status: "not_available", closing: null, closingDate: null };
  }
  const ascBreaks: number[] = [];
  const descBreaks: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const cur = lines[i];
    if (toCents(prev.balanceAfter!) + toCents(cur.amount) !== toCents(cur.balanceAfter!)) ascBreaks.push(cur.sourceRow);
    if (toCents(cur.balanceAfter!) + toCents(prev.amount) !== toCents(prev.balanceAfter!)) descBreaks.push(prev.sourceRow);
  }
  if (ascBreaks.length === 0) {
    const lastLine = lines.at(-1)!;
    return { status: "consistent", closing: lastLine.balanceAfter, closingDate: lastLine.bookingDate };
  }
  if (descBreaks.length === 0) {
    return { status: "consistent", closing: lines[0].balanceAfter, closingDate: lines[0].bookingDate };
  }
  const breaks = ascBreaks.length <= descBreaks.length ? ascBreaks : descBreaks;
  issues.push(
    warning("balance_break", `Solde après opération incohérent sur ${breaks.length} ligne(s) (opérations manquantes ?) — première ligne concernée : ${breaks[0]}`),
  );
  return { status: "inconsistent", closing: null, closingDate: null };
}
