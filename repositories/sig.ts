import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { importFiles, sigAccountOverrides, sigRuleSetApprovals, sigSnapshots, trialBalances, users } from "@/db/schema";
import type { AccountBalance, LineCode, RuleSetCode } from "@/domain/sig/types";
import type { RuntimeTx } from "@/lib/db/tenant";

/** Centimes exacts à partir d'un numeric PostgreSQL rendu en texte (« -1234.56 »). */
export function cents(v: string | null): bigint {
  if (v == null) return 0n;
  const neg = v.startsWith("-");
  const [i, d = ""] = (neg ? v.slice(1) : v).split(".");
  const c = BigInt(i || "0") * 100n + BigInt((d + "00").slice(0, 2));
  return neg ? -c : c;
}

// ───────────── Sources ─────────────

export async function listCurrentTrialBalances(tx: RuntimeTx, companyId: string, fiscalYearId: string) {
  return tx
    .select({
      id: trialBalances.id, periodEnd: trialBalances.periodEnd, dataStatus: trialBalances.dataStatus,
      importId: trialBalances.sourceImportId, fileName: importFiles.originalName,
    })
    .from(trialBalances)
    .innerJoin(importFiles, eq(importFiles.id, trialBalances.sourceImportId))
    .where(and(eq(trialBalances.companyId, companyId), eq(trialBalances.fiscalYearId, fiscalYearId), eq(trialBalances.isCurrent, true)))
    .orderBy(asc(trialBalances.periodEnd));
}

/** Soldes de clôture de la balance (cumul depuis l'ouverture), avec le rattachement PCG du compte. */
export async function trialBalanceAccounts(
  tx: RuntimeTx, companyId: string, tb: { id: string; importId: string; fileName: string | null },
): Promise<AccountBalance[]> {
  const rows = await tx.execute<{ account: string; label: string; pcg: string | null; debit: string; credit: string; row: number }>(sql`
    select l.account_number as account, coalesce(nullif(ca.label, ''), l.account_label) as label, ca.pcg_account as pcg,
           l.closing_debit::text as debit, l.closing_credit::text as credit, l.source_row as row
    from app.trial_balance_lines l
    left join app.chart_of_accounts ca on ca.company_id = l.company_id and ca.account_number = l.account_number
    where l.company_id = ${companyId} and l.trial_balance_id = ${tb.id}
    order by l.account_number`);
  return rows.map((r) => {
    const debit = cents(r.debit);
    const credit = cents(r.credit);
    return {
      account: r.account, label: r.label, pcgAccount: r.pcg, net: debit - credit, debit, credit,
      origin: { importId: tb.importId, fileName: tb.fileName, rows: [r.row] },
    };
  });
}

export async function findCurrentFec(tx: RuntimeTx, companyId: string, fiscalYearId: string) {
  const [row] = await tx.execute<{ id: string; file_name: string; first: string | null; last: string | null; lines: number }>(sql`
    select f.id, f.original_name as file_name,
           (select min(e.entry_date)::text from app.accounting_entries e where e.company_id = f.company_id and e.import_file_id = f.id) as first,
           (select max(e.entry_date)::text from app.accounting_entries e where e.company_id = f.company_id and e.import_file_id = f.id) as last,
           coalesce(f.row_count, 0) as lines
    from app.import_files f
    where f.company_id = ${companyId} and f.fiscal_year_id = ${fiscalYearId} and f.kind = 'fec' and f.status = 'committed'`);
  return row ? { id: row.id, fileName: row.file_name, first: row.first, last: row.last, lines: Number(row.lines) } : null;
}

/** Agrégation SQL des écritures du FEC courant par compte sur la période (une requête). */
export async function fecAccounts(
  tx: RuntimeTx, companyId: string, fec: { id: string; fileName: string }, start: string, end: string,
): Promise<AccountBalance[]> {
  const rows = await tx.execute<{ account: string; label: string; pcg: string | null; debit: string; credit: string; entries: number }>(sql`
    select e.account_number as account,
           coalesce(nullif(max(ca.label), ''), max(e.account_label)) as label, max(ca.pcg_account) as pcg,
           sum(e.debit)::text as debit, sum(e.credit)::text as credit,
           count(distinct (e.journal_code, e.entry_number)) as entries
    from app.accounting_entries e
    left join app.chart_of_accounts ca on ca.company_id = e.company_id and ca.account_number = e.account_number
    where e.company_id = ${companyId} and e.import_file_id = ${fec.id} and e.entry_date between ${start} and ${end}
    group by e.account_number
    order by e.account_number`);
  return rows.map((r) => {
    const debit = cents(r.debit);
    const credit = cents(r.credit);
    return {
      account: r.account, label: r.label, pcgAccount: r.pcg, net: debit - credit, debit, credit,
      origin: { importId: fec.id, fileName: fec.fileName, entries: Number(r.entries) },
    };
  });
}

/** Écritures de détermination du résultat : une même écriture mouvemente le 12 et des comptes 6/7. */
export async function fecClosingEntries(tx: RuntimeTx, companyId: string, fecId: string, start: string, end: string) {
  return tx.execute<{ entryNumber: string; journal: string; date: string }>(sql`
    select e.entry_number as "entryNumber", e.journal_code as journal, min(e.entry_date)::text as date
    from app.accounting_entries e
    where e.company_id = ${companyId} and e.import_file_id = ${fecId} and e.entry_date between ${start} and ${end}
    group by e.journal_code, e.entry_number
    having bool_or(e.account_number like '12%') and bool_or(e.account_number ~ '^[67]')
    order by 3, 2, 1
    limit 50`);
}

/** Écritures d'un compte sur la période (justification d'une ligne SIG). */
export async function fecAccountEntries(tx: RuntimeTx, companyId: string, fecId: string, account: string, start: string, end: string, limit = 500) {
  return tx.execute<{
    journal: string; entryNumber: string; date: string; pieceRef: string; label: string; debit: string; credit: string; sourceRow: number;
  }>(sql`
    select e.journal_code as journal, e.entry_number as "entryNumber", e.entry_date::text as date, e.piece_ref as "pieceRef",
           e.label, e.debit::text as debit, e.credit::text as credit, e.source_row as "sourceRow"
    from app.accounting_entries e
    where e.company_id = ${companyId} and e.import_file_id = ${fecId} and e.account_number = ${account}
      and e.entry_date between ${start} and ${end}
    order by e.entry_date, e.journal_code, e.entry_number, e.source_row
    limit ${limit}`);
}

export async function dataFingerprint(tx: RuntimeTx, companyId: string, fiscalYearId: string): Promise<string> {
  const [r] = await tx.execute<{ fp: string }>(sql`select app.sig_data_fingerprint(${companyId}::uuid, ${fiscalYearId}::uuid) as fp`);
  return r.fp;
}

// ───────────── Exceptions d'entreprise ─────────────

export async function listActiveOverrides(tx: RuntimeTx, companyId: string, ruleSetCode: RuleSetCode) {
  return tx
    .select({ id: sigAccountOverrides.id, account: sigAccountOverrides.accountNumber, line: sigAccountOverrides.line, justification: sigAccountOverrides.justification })
    .from(sigAccountOverrides)
    .where(and(eq(sigAccountOverrides.companyId, companyId), eq(sigAccountOverrides.ruleSetCode, ruleSetCode), isNull(sigAccountOverrides.replacedAt)))
    .then((rows) => rows.map((r) => ({ ...r, line: r.line as LineCode })));
}

export async function listOverrideHistory(tx: RuntimeTx, companyId: string) {
  return tx
    .select({
      id: sigAccountOverrides.id, ruleSetCode: sigAccountOverrides.ruleSetCode, account: sigAccountOverrides.accountNumber,
      pcgAccount: sigAccountOverrides.pcgAccount, proposedLine: sigAccountOverrides.proposedLine, line: sigAccountOverrides.line,
      justification: sigAccountOverrides.justification, createdAt: sigAccountOverrides.createdAt, createdBy: users.fullName,
      replacedAt: sigAccountOverrides.replacedAt,
    })
    .from(sigAccountOverrides)
    .leftJoin(users, eq(users.id, sigAccountOverrides.createdBy))
    .where(eq(sigAccountOverrides.companyId, companyId))
    .orderBy(asc(sigAccountOverrides.accountNumber), desc(sigAccountOverrides.createdAt));
}

/** Remplace l'exception active éventuelle puis enregistre la nouvelle (historique conservé). */
export async function replaceOverride(
  tx: RuntimeTx,
  data: { companyId: string; ruleSetCode: RuleSetCode; accountNumber: string; pcgAccount: string | null; proposedLine: string | null; line: string; justification: string; userId: string },
) {
  const replaced = await tx
    .update(sigAccountOverrides)
    .set({ replacedAt: sql`now()`, replacedBy: data.userId })
    .where(and(
      eq(sigAccountOverrides.companyId, data.companyId), eq(sigAccountOverrides.ruleSetCode, data.ruleSetCode),
      eq(sigAccountOverrides.accountNumber, data.accountNumber), isNull(sigAccountOverrides.replacedAt),
    ))
    .returning({ id: sigAccountOverrides.id });
  const id = randomUUID();
  await tx.insert(sigAccountOverrides).values({
    id, companyId: data.companyId, ruleSetCode: data.ruleSetCode, accountNumber: data.accountNumber, pcgAccount: data.pcgAccount,
    proposedLine: data.proposedLine, line: data.line, justification: data.justification, createdBy: data.userId,
  });
  return { id, replacedId: replaced[0]?.id ?? null };
}

// ───────────── Validation du référentiel par le cabinet ─────────────

export async function listApprovals(tx: RuntimeTx, firmId: string) {
  return tx
    .select({
      ruleSetCode: sigRuleSetApprovals.ruleSetCode, ruleSetVersion: sigRuleSetApprovals.ruleSetVersion, rulesHash: sigRuleSetApprovals.rulesHash,
      approvedAt: sigRuleSetApprovals.approvedAt, approvedBy: users.fullName,
    })
    .from(sigRuleSetApprovals)
    .leftJoin(users, eq(users.id, sigRuleSetApprovals.approvedBy))
    .where(eq(sigRuleSetApprovals.firmId, firmId))
    .orderBy(desc(sigRuleSetApprovals.approvedAt));
}

export async function insertApproval(tx: RuntimeTx, data: { firmId: string; ruleSetCode: RuleSetCode; ruleSetVersion: number; rulesHash: string; userId: string }) {
  await tx.insert(sigRuleSetApprovals).values({
    firmId: data.firmId, ruleSetCode: data.ruleSetCode, ruleSetVersion: data.ruleSetVersion, rulesHash: data.rulesHash, approvedBy: data.userId,
  }).onConflictDoNothing();
}

// ───────────── Versions figées ─────────────

export type SnapshotRow = typeof sigSnapshots.$inferSelect;

export async function insertSnapshot(tx: RuntimeTx, data: Omit<typeof sigSnapshots.$inferInsert, "id">) {
  const id = randomUUID();
  await tx.insert(sigSnapshots).values({ ...data, id });
  return { id };
}

const snapshotSummary = {
  id: sigSnapshots.id, fiscalYearId: sigSnapshots.fiscalYearId, periodKind: sigSnapshots.periodKind, periodMonth: sigSnapshots.periodMonth,
  periodStart: sigSnapshots.periodStart, periodEnd: sigSnapshots.periodEnd, source: sigSnapshots.source, sourceChoice: sigSnapshots.sourceChoice,
  ruleSetCode: sigSnapshots.ruleSetCode, rulesHash: sigSnapshots.rulesHash, dataFingerprint: sigSnapshots.dataFingerprint,
  contentHash: sigSnapshots.contentHash, status: sigSnapshots.status, validatedAt: sigSnapshots.validatedAt, publishedAt: sigSnapshots.publishedAt,
  validatedBy: sigSnapshots.validatedBy, publishedBy: sigSnapshots.publishedBy,
};

export async function listSnapshots(tx: RuntimeTx, companyId: string, onlyPublished: boolean) {
  return tx
    .select(snapshotSummary)
    .from(sigSnapshots)
    .where(and(eq(sigSnapshots.companyId, companyId), onlyPublished ? eq(sigSnapshots.status, "published") : undefined))
    .orderBy(desc(sigSnapshots.validatedAt));
}

export async function findSnapshot(tx: RuntimeTx, companyId: string, id: string) {
  const [row] = await tx.select().from(sigSnapshots).where(and(eq(sigSnapshots.companyId, companyId), eq(sigSnapshots.id, id)));
  return row ?? null;
}

export async function publishSnapshot(tx: RuntimeTx, companyId: string, id: string, userId: string) {
  const rows = await tx
    .update(sigSnapshots)
    .set({ status: "published", publishedAt: sql`now()`, publishedBy: userId })
    .where(and(eq(sigSnapshots.companyId, companyId), eq(sigSnapshots.id, id), eq(sigSnapshots.status, "validated")))
    .returning({ id: sigSnapshots.id });
  return rows.length === 1;
}

export async function userNames(tx: RuntimeTx, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
