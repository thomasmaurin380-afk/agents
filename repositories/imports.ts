import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { columnMappingTemplates, importFiles, importRows, storageCleanupQueue, users } from "@/db/schema";
import type { RuntimeTx } from "@/lib/db/tenant";

export type ImportFileRow = typeof importFiles.$inferSelect;
export type NewImportFile = Omit<typeof importFiles.$inferInsert, "id" | "status" | "createdAt">;

export async function insertImportFile(tx: RuntimeTx, data: NewImportFile, id = randomUUID()) {
  await tx.insert(importFiles).values({ ...data, id });
  return { id };
}

export async function findImportFile(tx: RuntimeTx, companyId: string, id: string) {
  const [row] = await tx.select().from(importFiles).where(and(eq(importFiles.companyId, companyId), eq(importFiles.id, id)));
  return row ?? null;
}

export async function findCommittedBySha(tx: RuntimeTx, companyId: string, sha256: string) {
  const [row] = await tx
    .select({ id: importFiles.id, originalName: importFiles.originalName, committedAt: importFiles.committedAt })
    .from(importFiles)
    .where(and(eq(importFiles.companyId, companyId), eq(importFiles.sha256, sha256), inArray(importFiles.status, ["committed", "superseded"])));
  return row ?? null;
}

export async function findCurrentFec(tx: RuntimeTx, companyId: string, fiscalYearId: string) {
  const [row] = await tx
    .select({ id: importFiles.id, originalName: importFiles.originalName, committedAt: importFiles.committedAt })
    .from(importFiles)
    .where(and(eq(importFiles.companyId, companyId), eq(importFiles.fiscalYearId, fiscalYearId), eq(importFiles.kind, "fec"), eq(importFiles.status, "committed")));
  return row ?? null;
}

export async function listImportFiles(tx: RuntimeTx, companyId: string) {
  return tx
    .select({
      id: importFiles.id,
      kind: importFiles.kind,
      status: importFiles.status,
      originalName: importFiles.originalName,
      createdAt: importFiles.createdAt,
      committedAt: importFiles.committedAt,
      rowCount: importFiles.rowCount,
      createdByName: users.fullName,
      report: importFiles.report,
    })
    .from(importFiles)
    .leftJoin(users, eq(users.id, importFiles.createdBy))
    .where(eq(importFiles.companyId, companyId))
    .orderBy(desc(importFiles.createdAt))
    .limit(100);
}

export async function updateImportFile(
  tx: RuntimeTx,
  companyId: string,
  id: string,
  data: Partial<Pick<ImportFileRow, "status" | "mapping" | "report" | "rowCount" | "committedAt" | "committedBy">>,
) {
  await tx.update(importFiles).set(data).where(and(eq(importFiles.companyId, companyId), eq(importFiles.id, id)));
}

export async function insertImportRows(tx: RuntimeTx, rows: (typeof importRows.$inferInsert)[]) {
  for (let i = 0; i < rows.length; i += 2000) await tx.insert(importRows).values(rows.slice(i, i + 2000));
}

export async function findTemplate(tx: RuntimeTx, companyId: string, kind: ImportFileRow["kind"], headerSignature: string) {
  const [row] = await tx
    .select()
    .from(columnMappingTemplates)
    .where(and(eq(columnMappingTemplates.companyId, companyId), eq(columnMappingTemplates.kind, kind), eq(columnMappingTemplates.headerSignature, headerSignature)));
  return row ?? null;
}

export async function upsertTemplate(
  tx: RuntimeTx,
  data: { companyId: string; kind: ImportFileRow["kind"]; headerSignature: string; mapping: unknown; createdBy: string },
) {
  await tx
    .insert(columnMappingTemplates)
    .values(data)
    .onConflictDoUpdate({
      target: [columnMappingTemplates.companyId, columnMappingTemplates.kind, columnMappingTemplates.headerSignature],
      set: { mapping: data.mapping, updatedAt: sql`now()`, createdBy: data.createdBy },
    });
}

// ───────────── Suppression d'un import ─────────────

export type DeletionPlan = {
  import: {
    id: string; kind: ImportFileRow["kind"]; status: ImportFileRow["status"]; fileName: string;
    fiscalYearId: string | null; periodEnd: string | null; dataStatus: string | null; bankAccountId: string | null;
    committedAt: string | null;
  };
  counts: { trialBalances: number; trialBalanceLines: number; accountingEntries: number; bankTransactions: number; importRows: number };
  accounts: { reassigned: number; keptManual: number; deleted: number };
  versions: {
    isCurrent: boolean;
    previous: { importId: string; fileName: string; isCurrent: boolean } | null;
    newer: { importId: string; fileName: string; isCurrent: boolean } | null;
  };
  remainingSources: { trialBalance: boolean; fec: boolean; bank: boolean };
  storage: { sharedWith: number };
  blockers: string[];
};

export async function importDeletionPlan(tx: RuntimeTx, companyId: string, importId: string): Promise<DeletionPlan> {
  const [r] = await tx.execute<{ plan: DeletionPlan }>(
    sql`select app.import_deletion_plan(${companyId}::uuid, ${importId}::uuid) as plan`,
  );
  return r.plan;
}

export type DeletionResult = {
  trialBalanceLines: number; accountingEntries: number; bankTransactions: number; importRows: number;
  accountsDeleted: number; accountsReassigned: number; accountsKeptManual: number;
  reactivatedImportId: string | null; storageCleanupId: string | null;
};

export async function deleteImportData(tx: RuntimeTx, companyId: string, importId: string, reactivatePrevious: boolean) {
  const [r] = await tx.execute<{ result: DeletionResult }>(
    sql`select app.delete_import(${companyId}::uuid, ${importId}::uuid, ${reactivatePrevious}) as result`,
  );
  return r.result;
}

export async function pendingStorageCleanups(tx: RuntimeTx, companyId: string, limit = 20) {
  return tx
    .select()
    .from(storageCleanupQueue)
    .where(and(eq(storageCleanupQueue.companyId, companyId), eq(storageCleanupQueue.status, "pending")))
    .orderBy(storageCleanupQueue.createdAt)
    .limit(limit);
}

export async function storageKeyInUse(tx: RuntimeTx, companyId: string, storageKey: string) {
  const [row] = await tx
    .select({ id: importFiles.id })
    .from(importFiles)
    .where(and(eq(importFiles.companyId, companyId), eq(importFiles.storageKey, storageKey)))
    .limit(1);
  return Boolean(row);
}

export async function updateStorageCleanup(
  tx: RuntimeTx,
  companyId: string,
  id: string,
  data: { status?: "pending" | "done" | "skipped"; attempts?: number; lastError?: string | null },
) {
  await tx
    .update(storageCleanupQueue)
    .set({ ...data, updatedAt: sql`now()` })
    .where(and(eq(storageCleanupQueue.companyId, companyId), eq(storageCleanupQueue.id, id)));
}
