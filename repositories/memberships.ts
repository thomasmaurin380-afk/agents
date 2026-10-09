import { and, asc, eq } from "drizzle-orm";
import { companies, companyAdvisors, companyMembers, firmMembers, firms, users } from "@/db/schema";
import type { RuntimeTx } from "@/lib/db/tenant";

export async function getProfile(tx: RuntimeTx, userId: string) {
  const [row] = await tx
    .select({ id: users.id, email: users.email, fullName: users.fullName, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

export async function firmMembershipsOf(tx: RuntimeTx, userId: string) {
  return tx
    .select({ firmId: firmMembers.firmId, role: firmMembers.role, firmName: firms.name })
    .from(firmMembers)
    .innerJoin(firms, eq(firms.id, firmMembers.firmId))
    .where(eq(firmMembers.userId, userId));
}

export async function clientMembershipsOf(tx: RuntimeTx, userId: string) {
  return tx
    .select({
      companyId: companyMembers.companyId,
      role: companyMembers.role,
      companyName: companies.legalName,
      tradeName: companies.tradeName,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, userId))
    .orderBy(asc(companies.legalName));
}

export async function isAssignedAdvisor(tx: RuntimeTx, companyId: string, userId: string) {
  const [row] = await tx
    .select({ id: companyAdvisors.id })
    .from(companyAdvisors)
    .where(and(eq(companyAdvisors.companyId, companyId), eq(companyAdvisors.userId, userId)));
  return Boolean(row);
}

export async function listCompanyClients(tx: RuntimeTx, companyId: string) {
  return tx
    .select({
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      role: companyMembers.role,
    })
    .from(companyMembers)
    .innerJoin(users, eq(users.id, companyMembers.userId))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(asc(users.fullName));
}

export async function listCompanyAdvisors(tx: RuntimeTx, companyId: string) {
  return tx
    .select({ userId: users.id, fullName: users.fullName, email: users.email })
    .from(companyAdvisors)
    .innerJoin(users, eq(users.id, companyAdvisors.userId))
    .where(eq(companyAdvisors.companyId, companyId))
    .orderBy(asc(users.fullName));
}

export async function listFirmStaff(tx: RuntimeTx, firmId: string) {
  return tx
    .select({ userId: users.id, fullName: users.fullName, email: users.email, role: firmMembers.role })
    .from(firmMembers)
    .innerJoin(users, eq(users.id, firmMembers.userId))
    .where(eq(firmMembers.firmId, firmId))
    .orderBy(asc(users.fullName));
}

export async function addAdvisor(tx: RuntimeTx, companyId: string, userId: string) {
  await tx.insert(companyAdvisors).values({ companyId, userId }).onConflictDoNothing();
}

export async function removeAdvisor(tx: RuntimeTx, companyId: string, userId: string) {
  await tx
    .delete(companyAdvisors)
    .where(and(eq(companyAdvisors.companyId, companyId), eq(companyAdvisors.userId, userId)));
}
