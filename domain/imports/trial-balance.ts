import { formatAmountFr as fr, fromCents, sumAmounts, toCents } from "./amounts";
import { ColumnReader, dataRows } from "./column-reader";
import { normalizeAccountNumber } from "./accounts";
import { error, warning, type ImportIssue } from "./issues";
import type { RawTable } from "./table";

export type TrialBalanceAmountMode = "debit_credit" | "signed" | "amount_direction";

export type TrialBalanceMapping = {
  headerRow: number;
  amountMode: TrialBalanceAmountMode;
  columns: Partial<Record<
    | "account_number" | "account_label" | "opening_debit" | "opening_credit" | "movement_debit"
    | "movement_credit" | "closing_debit" | "closing_credit" | "balance" | "direction",
    number | null
  >>;
};

export type TrialBalanceLine = {
  sourceRow: number;
  accountNumber: string;
  accountLabel: string;
  openingDebit: string | null;
  openingCredit: string | null;
  movementDebit: string | null;
  movementCredit: string | null;
  closingDebit: string;
  closingCredit: string;
};

export type TrialBalanceAnalysis = {
  lines: TrialBalanceLine[];
  issues: ImportIssue[];
  ignoredRows: number[];
  totals: { closingDebit: string; closingCredit: string; movementDebit: string | null; movementCredit: string | null };
};

/** Colonnes requises selon le mode de lecture des soldes. */
export function trialBalanceMappingErrors(m: TrialBalanceMapping): string[] {
  const c = m.columns;
  const errs: string[] = [];
  if (c.account_number == null) errs.push("La colonne « N° de compte » est obligatoire.");
  if (m.amountMode === "debit_credit" && (c.closing_debit == null || c.closing_credit == null)) {
    errs.push("Mode débit/crédit : les colonnes « Solde débit » et « Solde crédit » sont obligatoires.");
  }
  if (m.amountMode === "signed" && c.balance == null) errs.push("Mode solde signé : la colonne « Solde » est obligatoire.");
  if (m.amountMode === "amount_direction" && (c.balance == null || c.direction == null)) {
    errs.push("Mode solde + sens : les colonnes « Solde » et « Sens » sont obligatoires.");
  }
  if ((c.movement_debit == null) !== (c.movement_credit == null)) {
    errs.push("Les mouvements débit et crédit doivent être associés ensemble (ou aucun).");
  }
  if ((c.opening_debit == null) !== (c.opening_credit == null)) {
    errs.push("Les à-nouveaux débit et crédit doivent être associés ensemble (ou aucun).");
  }
  return errs;
}

const TOTAL_LINE = /^(total|sous total|s\/total|classe|totaux|report)\b/i;

export function analyzeTrialBalance(table: RawTable, mapping: TrialBalanceMapping): TrialBalanceAnalysis {
  const issues: ImportIssue[] = [];
  const lines: TrialBalanceLine[] = [];
  const ignoredRows: number[] = [];
  const mappingErrs = trialBalanceMappingErrors(mapping);
  if (mappingErrs.length > 0) {
    return {
      lines, ignoredRows,
      issues: mappingErrs.map((m) => error("mapping_incomplete", m)),
      totals: { closingDebit: "0.00", closingCredit: "0.00", movementDebit: null, movementCredit: null },
    };
  }
  const c = mapping.columns;
  const rows = dataRows(table, mapping.headerRow);
  const reader = new ColumnReader(rows);
  const seen = new Map<string, number>();

  const amt = (row: (typeof rows)[number], col: number | null | undefined, field: string): string | null | undefined => {
    const r = reader.amount(row, col);
    if (!r.ok) {
      issues.push(error("invalid_amount", r.reason, row.rowNumber, field));
      return undefined;
    }
    return r.value;
  };

  for (const row of rows) {
    const rawAccount = reader.text(row, c.account_number);
    const label = reader.text(row, c.account_label);
    if (rawAccount === "" || TOTAL_LINE.test(rawAccount) || (/\s/.test(rawAccount.trim()) && !/\d/.test(rawAccount))) {
      ignoredRows.push(row.rowNumber);
      issues.push(warning("ignored_line", "Ligne sans numéro de compte ignorée (total ou titre ?)", row.rowNumber));
      continue;
    }
    const account = normalizeAccountNumber(rawAccount);
    if (!/^[0-9A-Z]{1,30}$/.test(account)) {
      issues.push(error("invalid_account", `Numéro de compte invalide : « ${rawAccount} »`, row.rowNumber, "account_number"));
      continue;
    }

    let closingDebit = "0.00";
    let closingCredit = "0.00";
    let rowOk = true;
    if (mapping.amountMode === "debit_credit") {
      const d = amt(row, c.closing_debit, "closing_debit");
      const cr = amt(row, c.closing_credit, "closing_credit");
      if (d === undefined || cr === undefined) rowOk = false;
      else {
        closingDebit = d ?? "0.00";
        closingCredit = cr ?? "0.00";
        if (closingDebit.startsWith("-") || closingCredit.startsWith("-")) {
          issues.push(error("negative_balance_column", "Montant négatif dans une colonne de solde débit/crédit", row.rowNumber));
          rowOk = false;
        } else if (toCents(closingDebit) !== 0n && toCents(closingCredit) !== 0n) {
          issues.push(error("both_sides", "Solde à la fois débiteur et créditeur", row.rowNumber));
          rowOk = false;
        }
      }
    } else {
      const b = amt(row, c.balance, "balance");
      if (b === undefined) rowOk = false;
      else {
        const value = b ?? "0.00";
        let isDebit = !value.startsWith("-");
        if (mapping.amountMode === "amount_direction") {
          const dir = reader.text(row, c.direction).toUpperCase();
          if (value.startsWith("-")) {
            issues.push(error("negative_with_direction", "Solde négatif alors qu'un sens est indiqué", row.rowNumber));
            rowOk = false;
          } else if (/^(D|DB|DEBIT|DÉBIT|DEBITEUR|DÉBITEUR|\+1)$/.test(dir)) isDebit = true;
          else if (/^(C|CR|CREDIT|CRÉDIT|CREDITEUR|CRÉDITEUR|-1)$/.test(dir)) isDebit = false;
          else if (toCents(value) !== 0n) {
            issues.push(error("invalid_direction", `Sens du solde non reconnu : « ${dir} »`, row.rowNumber, "direction"));
            rowOk = false;
          }
        }
        const abs = value.replace(/^-/, "");
        if (isDebit) closingDebit = abs;
        else closingCredit = abs;
      }
    }

    const od = amt(row, c.opening_debit, "opening_debit");
    const oc = amt(row, c.opening_credit, "opening_credit");
    const md = amt(row, c.movement_debit, "movement_debit");
    const mc = amt(row, c.movement_credit, "movement_credit");
    if ([od, oc, md, mc].includes(undefined)) rowOk = false;
    if (!rowOk) continue;

    const prev = seen.get(account);
    if (prev != null) {
      issues.push(error("duplicate_account", `Compte ${account} en double (déjà présent ligne ${prev})`, row.rowNumber, "account_number"));
      continue;
    }
    seen.set(account, row.rowNumber);

    const line: TrialBalanceLine = {
      sourceRow: row.rowNumber,
      accountNumber: account,
      accountLabel: label,
      openingDebit: c.opening_debit == null ? null : (od ?? "0.00"),
      openingCredit: c.opening_credit == null ? null : (oc ?? "0.00"),
      movementDebit: c.movement_debit == null ? null : (md ?? "0.00"),
      movementCredit: c.movement_credit == null ? null : (mc ?? "0.00"),
      closingDebit,
      closingCredit,
    };
    // Cohérence ligne : à-nouveau + mouvements = solde (si toutes les colonnes sont présentes).
    if (line.openingDebit != null && line.movementDebit != null) {
      const computed =
        toCents(line.openingDebit) - toCents(line.openingCredit!) + toCents(line.movementDebit) - toCents(line.movementCredit!);
      const closing = toCents(closingDebit) - toCents(closingCredit);
      if (computed !== closing) {
        issues.push(
          warning("line_inconsistent", `À-nouveau + mouvements (${fr(fromCents(computed))}) ≠ solde (${fr(fromCents(closing))})`, row.rowNumber),
        );
      }
    }
    lines.push(line);
  }

  const totals = {
    closingDebit: sumAmounts(lines.map((l) => l.closingDebit)),
    closingCredit: sumAmounts(lines.map((l) => l.closingCredit)),
    movementDebit: c.movement_debit == null ? null : sumAmounts(lines.map((l) => l.movementDebit)),
    movementCredit: c.movement_credit == null ? null : sumAmounts(lines.map((l) => l.movementCredit)),
  };
  if (lines.length === 0 && !issues.some((i) => i.severity === "error")) {
    issues.push(error("empty", "Aucune ligne de compte exploitable dans le fichier"));
  }
  const gap = toCents(totals.closingDebit) - toCents(totals.closingCredit);
  if (gap !== 0n) {
    issues.push(
      error(
        "unbalanced",
        `Balance déséquilibrée : soldes débiteurs ${fr(totals.closingDebit)} ≠ soldes créditeurs ${fr(totals.closingCredit)} (écart ${fr(fromCents(gap < 0n ? -gap : gap))})`,
      ),
    );
  }
  if (totals.movementDebit != null && totals.movementDebit !== totals.movementCredit) {
    issues.push(
      error("unbalanced_movements", `Mouvements déséquilibrés : débit ${fr(totals.movementDebit)} ≠ crédit ${fr(totals.movementCredit!)}`),
    );
  }
  return { lines, issues, ignoredRows, totals };
}
