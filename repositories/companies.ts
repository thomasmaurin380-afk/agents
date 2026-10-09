import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { companies, users } from "@/db/schema";
import type { RuntimeTx } from "@/lib/db/tenant";

export type CompanyRow = typeof companies.$inferSelect;
export type NewCompany = Pick<
  typeof companies.$inferInsert,
  | "firmId"
  | "legalName"
  | "tradeName"
  | "siren"
  | "legalForm"
  | "nafCode"
  | "sector"
  | "fiscalYearStartMonth"
  | "leadAdvisorId"
  | "createdBy"
>;

const lead = alias(users, "lead");

/** Entreprises visibles par l'utilisateur courant (filtrage par RLS). */
export async function listVisibleCompanies(tx: RuntimeTx) {
  return tx
    .select({
      id: companies.id,
      firmId: companies.firmId,
      legalName: companies.legalName,
      tradeName: companies.tradeName,
      sector: companies.sector,
      status: companies.status,
      fiscalYearStartMonth: companies.fiscalYearStartMonth,
      dataVersion: companies.dataVersion,
      leadAdvisorName: lead.fullName,
      updatedAt: companies.updatedAt,
    })
    .from(companies)
    .leftJoin(lead, eq(lead.id, companies.leadAdvisorId))
    .orderBy(asc(companies.legalName));
}

export async function findCompany(tx: RuntimeTx, companyId: string) {
  const [row] = await tx
    .select({
      company: companies,
      leadAdvisorName: lead.fullName,
      leadAdvisorEmail: lead.email,
    })
    .from(companies)
    .leftJoin(lead, eq(lead.id, companies.leadAdvisorId))
    .where(eq(companies.id, companyId));
  return row ?? null;
}

/**
 * Insère une entreprise. Pas de RETURNING : sous RLS, la ligne n'est pas encore visible de la
 * politique de lecture pendant l'instruction d'insertion. L'identifiant est généré ici.
 */
export async function insertCompany(tx: RuntimeTx, data: NewCompany) {
  const id = randomUUID();
  await tx.insert(companies).values({ ...data, id });
  return { id };
}

export async function updateCompanyProfile(
  tx: RuntimeTx,
  companyId: string,
  data: Partial<
    Pick<
      CompanyRow,
      | "legalName"
      | "tradeName"
      | "siren"
      | "legalForm"
      | "nafCode"
      | "sector"
      | "fiscalYearStartMonth"
      | "status"
      | "leadAdvisorId"
    >
  >,
) {
  const rows = await tx
    .update(companies)
    .set({ ...data, updatedAt: sql`now()` })
    .where(eq(companies.id, companyId))
    .returning({ id: companies.id });
  return rows.length;
}
