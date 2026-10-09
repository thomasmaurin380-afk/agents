import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import {
  type accountingEntries, accountMappingRules, chartOfAccounts, trialBalanceLines, trialBalances,
} from "@/db/schema";
import type { AccountClassification, AccountMappingRule } from "@/domain/imports/accounts";
import type { RuntimeTx } from "@/lib/db/tenant";

export async function findCurrentTrialBalance(tx: RuntimeTx, companyId: string, fiscalYearId: string, periodEnd: string) {
  const [row] = await tx
    .select({ id: trialBalances.id, sourceImportId: trialBalances.sourceImportId, createdAt: trialBalances.createdAt })
    .from(trialBalances)
    .where(
      and(
        eq(trialBalances.companyId, companyId),
        eq(trialBalances.fiscalYearId, fiscalYearId),
        eq(trialBalances.periodEnd, periodEnd),
        eq(trialBalances.isCurrent, true),
      ),
    );
  return row ?? null;
}

export async function retireTrialBalance(tx: RuntimeTx, companyId: string, id: string) {
  await tx.update(trialBalances).set({ isCurrent: false }).where(and(eq(trialBalances.companyId, companyId), eq(trialBalances.id, id)));
}

export async function insertTrialBalance(tx: RuntimeTx, data: Omit<typeof trialBalances.$inferInsert, "id">) {
  const id = randomUUID();
  await tx.insert(trialBalances).values({ ...data, id });
  return { id };
}

export async function insertTrialBalanceLines(tx: RuntimeTx, rows: (typeof trialBalanceLines.$inferInsert)[]) {
  for (let i = 0; i < rows.length; i += 2000) await tx.insert(trialBalanceLines).values(rows.slice(i, i + 2000));
}

/**
 * Insertion en masse des écritures : un lot de 10 000 lignes = un seul paramètre JSON décomposé
 * par `jsonb_to_recordset` (≈ 5 fois plus rapide qu'un INSERT multi-lignes paramétré).
 * Les montants restent des chaînes décimales jusqu'au cast `numeric` : aucun flottant.
 */
export async function insertAccountingEntries(tx: RuntimeTx, rows: (typeof accountingEntries.$inferInsert)[]) {
  for (let i = 0; i < rows.length; i += 10_000) {
    const batch = rows.slice(i, i + 10_000).map((r) => ({
      company_id: r.companyId, fiscal_year_id: r.fiscalYearId, import_file_id: r.importFileId,
      journal_code: r.journalCode, journal_label: r.journalLabel ?? "", entry_number: r.entryNumber, entry_date: r.entryDate,
      account_number: r.accountNumber, account_label: r.accountLabel ?? "", aux_account: r.auxAccount ?? null, aux_label: r.auxLabel ?? null,
      piece_ref: r.pieceRef ?? "", piece_date: r.pieceDate ?? null, label: r.label ?? "", debit: r.debit, credit: r.credit,
      lettering: r.lettering ?? null, lettering_date: r.letteringDate ?? null, validation_date: r.validationDate ?? null,
      currency_amount: r.currencyAmount ?? null, currency: r.currency ?? null, source_row: r.sourceRow,
    }));
    await tx.execute(sql`
      insert into app.accounting_entries (
        company_id, fiscal_year_id, import_file_id, journal_code, journal_label, entry_number, entry_date,
        account_number, account_label, aux_account, aux_label, piece_ref, piece_date, label, debit, credit,
        lettering, lettering_date, validation_date, currency_amount, currency, source_row)
      select company_id, fiscal_year_id, import_file_id, journal_code, journal_label, entry_number, entry_date,
        account_number, account_label, aux_account, aux_label, piece_ref, piece_date, label, debit, credit,
        lettering, lettering_date, validation_date, currency_amount, currency, source_row
      from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as x(
        company_id uuid, fiscal_year_id uuid, import_file_id uuid, journal_code text, journal_label text, entry_number text,
        entry_date date, account_number text, account_label text, aux_account text, aux_label text, piece_ref text,
        piece_date date, label text, debit numeric(18,2), credit numeric(18,2), lettering text, lettering_date date,
        validation_date date, currency_amount numeric(18,2), currency text, source_row int)`);
  }
}

export async function listTrialBalances(tx: RuntimeTx, companyId: string) {
  return tx
    .select({
      id: trialBalances.id,
      fiscalYearId: trialBalances.fiscalYearId,
      periodEnd: trialBalances.periodEnd,
      dataStatus: trialBalances.dataStatus,
      isCurrent: trialBalances.isCurrent,
      totalDebit: trialBalances.totalDebit,
      lineCount: trialBalances.lineCount,
      sourceImportId: trialBalances.sourceImportId,
    })
    .from(trialBalances)
    .where(eq(trialBalances.companyId, companyId))
    .orderBy(asc(trialBalances.periodEnd));
}

// ───────────── Plan de comptes ─────────────

export async function listMappingRules(tx: RuntimeTx, companyId: string): Promise<AccountMappingRule[]> {
  return tx
    .select({ id: accountMappingRules.id, matchType: accountMappingRules.matchType, pattern: accountMappingRules.pattern, pcgAccount: accountMappingRules.pcgAccount })
    .from(accountMappingRules)
    .where(eq(accountMappingRules.companyId, companyId))
    .orderBy(asc(accountMappingRules.pattern));
}

export async function insertMappingRule(
  tx: RuntimeTx,
  data: { companyId: string; matchType: "exact" | "prefix"; pattern: string; pcgAccount: string; createdBy: string },
) {
  const id = randomUUID();
  await tx
    .insert(accountMappingRules)
    .values({ ...data, id })
    .onConflictDoUpdate({
      target: [accountMappingRules.companyId, accountMappingRules.matchType, accountMappingRules.pattern],
      set: { pcgAccount: data.pcgAccount },
    });
  const [row] = await tx
    .select({ id: accountMappingRules.id })
    .from(accountMappingRules)
    .where(and(eq(accountMappingRules.companyId, data.companyId), eq(accountMappingRules.matchType, data.matchType), eq(accountMappingRules.pattern, data.pattern)));
  return row;
}

export async function existingAccounts(tx: RuntimeTx, companyId: string, numbers: string[]) {
  const out = new Map<string, { label: string; mappingStatus: string }>();
  for (let i = 0; i < numbers.length; i += 5000) {
    const rows = await tx
      .select({ n: chartOfAccounts.accountNumber, label: chartOfAccounts.label, s: chartOfAccounts.mappingStatus })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, companyId), inArray(chartOfAccounts.accountNumber, numbers.slice(i, i + 5000))));
    for (const r of rows) out.set(r.n, { label: r.label, mappingStatus: r.s });
  }
  return out;
}

export async function insertAccounts(
  tx: RuntimeTx,
  companyId: string,
  importId: string,
  rows: { accountNumber: string; label: string; c: AccountClassification }[],
) {
  const values = rows.map((r) => ({
    companyId,
    accountNumber: r.accountNumber,
    label: r.label,
    pcgAccount: r.c.pcgAccount,
    pcgClass: r.c.pcgClass,
    isAuxiliary: r.c.isAuxiliary,
    mappingStatus: r.c.status,
    mappingRuleId: r.c.ruleId,
    firstSeenImportId: importId,
  }));
  for (let i = 0; i < values.length; i += 2000) {
    await tx.insert(chartOfAccounts).values(values.slice(i, i + 2000)).onConflictDoNothing();
  }
}

export async function fillMissingAccountLabels(tx: RuntimeTx, companyId: string, rows: { accountNumber: string; label: string }[]) {
  for (const r of rows) {
    await tx
      .update(chartOfAccounts)
      .set({ label: r.label, updatedAt: sql`now()` })
      .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.accountNumber, r.accountNumber), eq(chartOfAccounts.label, "")));
  }
}

export async function listAccounts(tx: RuntimeTx, companyId: string, onlyToReview: boolean) {
  const where = onlyToReview
    ? and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.mappingStatus, "to_review"))
    : eq(chartOfAccounts.companyId, companyId);
  return tx.select().from(chartOfAccounts).where(where).orderBy(asc(chartOfAccounts.accountNumber)).limit(2000);
}

export async function countAccountsByStatus(tx: RuntimeTx, companyId: string) {
  const rows = await tx
    .select({ status: chartOfAccounts.mappingStatus, n: count() })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.companyId, companyId))
    .groupBy(chartOfAccounts.mappingStatus);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<"auto_validated" | "to_review" | "manual", number>>;
}

export async function setAccountMapping(
  tx: RuntimeTx,
  companyId: string,
  accountNumber: string,
  data: { pcgAccount: string; status: "manual" | "auto_validated"; ruleId: string | null; updatedBy: string },
) {
  const res = await tx
    .update(chartOfAccounts)
    .set({
      pcgAccount: data.pcgAccount,
      pcgClass: Number(data.pcgAccount[0]),
      mappingStatus: data.status,
      mappingRuleId: data.ruleId,
      updatedAt: sql`now()`,
      updatedBy: data.updatedBy,
    })
    .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.accountNumber, accountNumber)))
    .returning({ id: chartOfAccounts.id });
  return res.length;
}

/** Sources disponibles pour les indicateurs (« Données insuffisantes » sinon). */
export async function availableSources(tx: RuntimeTx, companyId: string) {
  const [r] = await tx.execute<{ tb: boolean; fec: boolean; bank: boolean }>(sql`
    select
      exists (select 1 from app.trial_balances where company_id = ${companyId} and is_current) as tb,
      exists (select 1 from app.accounting_entries where company_id = ${companyId}) as fec,
      exists (select 1 from app.bank_transactions where company_id = ${companyId}) as bank`);
  return r;
}
