import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { fiscalYears } from "@/db/schema";
import type { RuntimeTx } from "@/lib/db/tenant";

export type FiscalYearRow = typeof fiscalYears.$inferSelect;

export async function listFiscalYears(tx: RuntimeTx, companyId: string) {
  return tx.select().from(fiscalYears).where(eq(fiscalYears.companyId, companyId)).orderBy(asc(fiscalYears.startDate));
}

export async function findFiscalYear(tx: RuntimeTx, companyId: string, id: string) {
  const [row] = await tx.select().from(fiscalYears).where(and(eq(fiscalYears.companyId, companyId), eq(fiscalYears.id, id)));
  return row ?? null;
}

export async function insertFiscalYear(
  tx: RuntimeTx,
  data: { companyId: string; label: string; startDate: string; endDate: string; createdBy: string },
) {
  const id = randomUUID();
  await tx.insert(fiscalYears).values({ ...data, id });
  return { id };
}
