import "server-only";
import { z } from "zod";
import { isValidSiren, normalizeSiren } from "@/domain/company/siren";
import { isUniqueViolation } from "@/lib/db/errors";
import { withUser } from "@/lib/db/tenant";
import { AccessDeniedError, ValidationError } from "@/lib/errors";
import { insertAudit } from "@/repositories/audit";
import {
  insertCompany,
  listVisibleCompanies,
  updateCompanyProfile,
} from "@/repositories/companies";
import { listOpenInvitations } from "@/repositories/invitations";
import {
  addAdvisor,
  listCompanyAdvisors,
  listCompanyClients,
  listFirmStaff,
  removeAdvisor,
} from "@/repositories/memberships";
import { adminFirmIds, isStaff, staffMfaSatisfied, type Actor } from "./actor";
import { authorizeCompany, recordDenied } from "./authorize";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const companyInputSchema = z.object({
  legalName: z.string().trim().min(1, "Raison sociale obligatoire").max(200),
  tradeName: optionalText(200),
  siren: z
    .string()
    .trim()
    .transform((v) => normalizeSiren(v))
    .refine((v) => v === "" || isValidSiren(v), "SIREN invalide (9 chiffres, clé de contrôle)")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  legalForm: optionalText(60),
  nafCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^\d{2}\.?\d{2}[A-Z]$/.test(v), "Code NAF invalide (ex. 62.02A)")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  sector: optionalText(120),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  leadAdvisorId: z
    .union([z.uuid(), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});
export type CompanyInput = z.input<typeof companyInputSchema>;

export const companyUpdateSchema = companyInputSchema.extend({
  status: z.enum(["onboarding", "active", "paused", "archived"]),
});

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const key = String(issue.path[0] ?? "_");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ValidationError("Formulaire invalide", fieldErrors);
  }
  return r.data;
}

/** Portefeuille du cabinet : entreprises visibles par le collaborateur (RLS). */
export async function listPortfolio(actor: Actor) {
  if (!isStaff(actor) || !staffMfaSatisfied(actor)) {
    await recordDenied(actor, { action: "portfolio.read", reason: "staff_only" });
    throw new AccessDeniedError("staff_only");
  }
  const firmIds = new Set(actor.firms.map((f) => f.firmId));
  return withUser(actor.userId, async (tx) => {
    const rows = await listVisibleCompanies(tx);
    return rows.filter((r) => firmIds.has(r.firmId));
  });
}

export async function createCompany(actor: Actor, raw: unknown) {
  const firms = adminFirmIds(actor);
  if (firms.length === 0 || !staffMfaSatisfied(actor)) {
    await recordDenied(actor, { action: "company.create", reason: "firm_admin_only" });
    throw new AccessDeniedError("firm_admin_only");
  }
  const input = parse(companyInputSchema, raw);
  const firmId = firms[0];
  try {
    return await withUser(actor.userId, async (tx) => {
      const row = await insertCompany(tx, {
        firmId,
        legalName: input.legalName,
        tradeName: input.tradeName ?? null,
        siren: input.siren ?? null,
        legalForm: input.legalForm ?? null,
        nafCode: input.nafCode ?? null,
        sector: input.sector ?? null,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        leadAdvisorId: input.leadAdvisorId ?? null,
        createdBy: actor.userId,
      });
      if (input.leadAdvisorId) await addAdvisor(tx, row.id, input.leadAdvisorId);
      await insertAudit(tx, {
        actorUserId: actor.userId,
        actorKind: "user",
        firmId,
        companyId: row.id,
        action: "company.create",
        objectType: "company",
        objectId: row.id,
        outcome: "success",
      });
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e, "companies_firm_siren_key")) {
      throw new ValidationError("Formulaire invalide", {
        siren: ["Une entreprise avec ce SIREN existe déjà dans le portefeuille"],
      });
    }
    throw e;
  }
}

export async function updateCompany(actor: Actor, companyId: string, raw: unknown) {
  const input = parse(companyUpdateSchema, raw);
  try {
    return await withUser(actor.userId, async (tx) => {
      const access = await authorizeCompany(tx, actor, companyId, "company", "update");
      await updateCompanyProfile(tx, companyId, {
        legalName: input.legalName,
        tradeName: input.tradeName ?? null,
        siren: input.siren ?? null,
        legalForm: input.legalForm ?? null,
        nafCode: input.nafCode ?? null,
        sector: input.sector ?? null,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        status: input.status,
        leadAdvisorId: input.leadAdvisorId ?? null,
      });
      if (input.leadAdvisorId) await addAdvisor(tx, companyId, input.leadAdvisorId);
      await insertAudit(tx, {
        actorUserId: actor.userId,
        actorKind: "user",
        firmId: access.company.firmId,
        companyId,
        action: "company.update",
        objectType: "company",
        objectId: companyId,
        outcome: "success",
        details: { status: input.status },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e, "companies_firm_siren_key")) {
      throw new ValidationError("Formulaire invalide", {
        siren: ["Une entreprise avec ce SIREN existe déjà dans le portefeuille"],
      });
    }
    throw e;
  }
}

/** Fiche entreprise côté DAF : identité, clients, conseillers, invitations en cours. */
export async function getCompanyWorkspace(actor: Actor, companyId: string) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "company", "read");
    if (access.role !== "firm_admin" && access.role !== "firm_analyst") {
      await recordDenied(actor, { companyId, action: "company.workspace", reason: "staff_only" });
      throw new AccessDeniedError("staff_only");
    }
    const isAdmin = access.role === "firm_admin";
    const [clients, advisors, invitations, staff] = await Promise.all([
      listCompanyClients(tx, companyId),
      listCompanyAdvisors(tx, companyId),
      isAdmin ? listOpenInvitations(tx, companyId) : Promise.resolve([]),
      isAdmin ? listFirmStaff(tx, access.company.firmId) : Promise.resolve([]),
    ]);
    return { ...access, clients, advisors, invitations, staff };
  });
}

/** Espace client : informations de l'entreprise visibles par le client. */
export async function getClientCompany(actor: Actor, companyId: string) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "company", "read");
    if (access.role === "firm_admin" || access.role === "firm_analyst") {
      // Le DAF consulte le portail en « aperçu client » : même données, mêmes filtres.
      return { ...access, preview: true as const };
    }
    return { ...access, preview: false as const };
  });
}

export async function setAdvisorAssignment(
  actor: Actor,
  companyId: string,
  userId: string,
  assigned: boolean,
) {
  if (!z.uuid().safeParse(userId).success) throw new ValidationError("Utilisateur invalide");
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "company", "admin");
    if (assigned) await addAdvisor(tx, companyId, userId);
    else {
      if (access.company.leadAdvisorId === userId) {
        throw new ValidationError("Le DAF référent ne peut pas être retiré ; changez d'abord de référent.");
      }
      await removeAdvisor(tx, companyId, userId);
    }
    await insertAudit(tx, {
      actorUserId: actor.userId,
      actorKind: "user",
      firmId: access.company.firmId,
      companyId,
      action: assigned ? "company.advisor.assign" : "company.advisor.unassign",
      objectType: "user",
      objectId: userId,
      outcome: "success",
    });
  });
}

/** Collaborateurs du cabinet pouvant être désignés référents (administrateur uniquement). */
export async function listAssignableStaff(actor: Actor) {
  const firms = adminFirmIds(actor);
  if (firms.length === 0 || !staffMfaSatisfied(actor)) throw new AccessDeniedError("firm_admin_only");
  return withUser(actor.userId, (tx) => listFirmStaff(tx, firms[0]));
}
