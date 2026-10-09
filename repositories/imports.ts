import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { columnMappingTemplates, importFiles, importRows, users } from "@/db/schema";
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
