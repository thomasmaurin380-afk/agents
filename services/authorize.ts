import "server-only";
import { z } from "zod";
import { can, type Action, type CompanyRole, type Resource } from "@/domain/permissions/matrix";
import { withUser, type RuntimeTx } from "@/lib/db/tenant";
import { AccessDeniedError } from "@/lib/errors";
import { insertAudit } from "@/repositories/audit";
import { findCompany } from "@/repositories/companies";
import { isAssignedAdvisor } from "@/repositories/memberships";
import { staffMfaSatisfied, type Actor } from "./actor";

const uuid = z.uuid();

export type CompanyAccess = {
  role: CompanyRole;
  company: NonNullable<Awaited<ReturnType<typeof findCompany>>>["company"];
  leadAdvisorName: string | null;
  leadAdvisorEmail: string | null;
};

/** Rôle effectif de l'acteur sur l'entreprise (null si aucun accès — la RLS a déjà filtré). */
export async function resolveCompanyAccess(
  tx: RuntimeTx,
  actor: Actor,
  companyId: string,
): Promise<CompanyAccess | null> {
  if (!uuid.safeParse(companyId).success) return null;
  const found = await findCompany(tx, companyId);
  if (!found) return null;
  const base = {
    company: found.company,
    leadAdvisorName: found.leadAdvisorName,
    leadAdvisorEmail: found.leadAdvisorEmail,
  };
  const firm = actor.firms.find((f) => f.firmId === found.company.firmId);
  if (firm?.role === "firm_admin") return { role: "firm_admin", ...base };
  if (firm && (await isAssignedAdvisor(tx, companyId, actor.userId))) {
    return { role: "firm_analyst", ...base };
  }
  const client = actor.clientCompanies.find((c) => c.companyId === companyId);
  if (client && found.company.status !== "archived") return { role: client.role, ...base };
  return null;
}

/** Journalise un refus dans une transaction distincte (survit à l'annulation de l'opération). */
export async function recordDenied(
  actor: Actor,
  args: { companyId?: string; action: string; reason: string },
): Promise<void> {
  await withUser(actor.userId, (tx) =>
    insertAudit(tx, {
      actorUserId: actor.userId,
      actorKind: "user",
      companyId: args.companyId && uuid.safeParse(args.companyId).success ? args.companyId : null,
      action: args.action,
      outcome: "denied",
      details: { reason: args.reason },
    }),
  );
}

/**
 * Vérifie, dans la transaction fournie, que l'acteur peut effectuer `action` sur `resource`
 * pour l'entreprise. Lève AccessDeniedError (après journalisation) sinon.
 */
export async function authorizeCompany(
  tx: RuntimeTx,
  actor: Actor,
  companyId: string,
  resource: Resource,
  action: Action,
): Promise<CompanyAccess> {
  const access = await resolveCompanyAccess(tx, actor, companyId);
  let reason: string | null = null;
  if (!access) reason = "no_company_access";
  else if ((access.role === "firm_admin" || access.role === "firm_analyst") && !staffMfaSatisfied(actor)) {
    reason = "mfa_required";
  } else if (!can(access.role, resource, action)) reason = `forbidden:${resource}.${action}`;

  if (reason || !access) {
    await recordDenied(actor, { companyId, action: `${resource}.${action}`, reason: reason ?? "denied" });
    throw new AccessDeniedError(reason ?? "denied");
  }
  return access;
}
