import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { classifyAccount, isValidPcgAccount, normalizeAccountNumber } from "@/domain/imports/accounts";
import { withUser } from "@/lib/db/tenant";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import {
  availableSources, countAccountsByStatus, insertMappingRule, listAccounts, listMappingRules, setAccountMapping,
} from "@/repositories/accounting";
import { insertAudit } from "@/repositories/audit";
import { insertBankAccount } from "@/repositories/bank-accounts";
import { insertFiscalYear } from "@/repositories/fiscal-years";
import type { DataSource } from "@/domain/shared/computation";
import type { Actor } from "./actor";
import { authorizeCompany } from "./authorize";

function fieldErrors(e: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const i of e.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

function staffOnly(role: string) {
  if (role !== "firm_admin" && role !== "firm_analyst") throw new AccessDeniedError("staff_only");
}

// ───────────── Exercices ─────────────

const fiscalYearSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide"),
    label: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.endDate > v.startDate, { path: ["endDate"], message: "La fin doit être postérieure au début" });

export async function createFiscalYear(actor: Actor, companyId: string, raw: unknown) {
  const parsed = fiscalYearSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Formulaire invalide", fieldErrors(parsed.error));
  const { startDate, endDate } = parsed.data;
  const label = parsed.data.label || `Exercice ${startDate.slice(0, 4) === endDate.slice(0, 4) ? endDate.slice(0, 4) : `${startDate.slice(0, 4)}-${endDate.slice(0, 4)}`}`;
  try {
    return await withUser(actor.userId, async (tx) => {
      const access = await authorizeCompany(tx, actor, companyId, "accounting_data", "update");
      staffOnly(access.role);
      const row = await insertFiscalYear(tx, { companyId, label, startDate, endDate, createdBy: actor.userId });
      await insertAudit(tx, {
        actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
        action: "fiscal_year.create", objectType: "fiscal_year", objectId: row.id, outcome: "success", details: { startDate, endDate },
      });
      return row;
    });
  } catch (e) {
    const c = (e as { cause?: { message?: string; constraint_name?: string } }).cause;
    if (c?.message?.includes("fiscal_year_overlap")) {
      throw new ValidationError("Formulaire invalide", { startDate: ["Cet exercice chevauche un exercice existant."] });
    }
    if (c?.constraint_name === "fiscal_years_dates") {
      throw new ValidationError("Formulaire invalide", { endDate: ["Un exercice dure au plus 24 mois."] });
    }
    throw e;
  }
}

// ───────────── Comptes bancaires ─────────────

const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, "Banque obligatoire").max(80),
  label: z.string().trim().min(1, "Nom du compte obligatoire").max(80),
  ibanLast4: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9A-Z]{4}$/.test(v), "4 caractères (fin de l'IBAN)")
    .transform((v) => (v === "" ? null : v)),
});

export async function createBankAccount(actor: Actor, companyId: string, raw: unknown) {
  const parsed = bankAccountSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Formulaire invalide", fieldErrors(parsed.error));
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "treasury", "update");
    staffOnly(access.role);
    const row = await insertBankAccount(tx, { companyId, ...parsed.data, createdBy: actor.userId });
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "bank_account.create", objectType: "bank_account", objectId: row.id, outcome: "success",
    });
    return row;
  });
}

// ───────────── Plan de comptes ─────────────

export async function getChartOfAccounts(actor: Actor, companyId: string, onlyToReview: boolean) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "accounting_data", "read");
    staffOnly(access.role);
    const [accounts, counts, rules] = await Promise.all([
      listAccounts(tx, companyId, onlyToReview),
      countAccountsByStatus(tx, companyId),
      listMappingRules(tx, companyId),
    ]);
    return { ...access, accounts, counts, rules };
  });
}

const accountMappingSchema = z.object({
  accountNumber: z.string().trim().min(1).max(30),
  pcgAccount: z.string().trim().refine(isValidPcgAccount, "Compte PCG invalide (classes 1 à 8, 3 chiffres minimum)"),
  createRule: z.enum(["none", "exact", "prefix"]).default("none"),
  rulePattern: z.string().trim().max(30).optional(),
});

/**
 * Rattachement manuel d'un compte au PCG. Peut créer une règle réutilisable, appliquée aussitôt
 * aux autres comptes « à vérifier » qu'elle couvre (jamais aux comptes rattachés manuellement).
 */
export async function mapAccount(actor: Actor, companyId: string, raw: unknown) {
  const parsed = accountMappingSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Formulaire invalide", fieldErrors(parsed.error));
  const v = parsed.data;
  const accountNumber = normalizeAccountNumber(v.accountNumber);
  const pattern = normalizeAccountNumber(v.rulePattern || accountNumber);
  if (v.createRule === "prefix" && !accountNumber.startsWith(pattern)) {
    throw new ValidationError("Formulaire invalide", { rulePattern: ["Le préfixe doit correspondre au début du compte."] });
  }
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "accounting_data", "update");
    staffOnly(access.role);
    let ruleId: string | null = null;
    if (v.createRule !== "none") {
      ruleId = (await insertMappingRule(tx, { companyId, matchType: v.createRule, pattern, pcgAccount: v.pcgAccount, createdBy: actor.userId })).id;
    }
    const updated = await setAccountMapping(tx, companyId, accountNumber, { pcgAccount: v.pcgAccount, status: "manual", ruleId, updatedBy: actor.userId });
    if (updated === 0) throw new BusinessRuleError("not_found", "Compte introuvable.");
    let applied = 0;
    if (ruleId) {
      const rules = await listMappingRules(tx, companyId);
      for (const acc of await listAccounts(tx, companyId, true)) {
        const c = classifyAccount(acc.accountNumber, rules);
        if (c.status === "auto_validated" && c.ruleId) {
          applied += await setAccountMapping(tx, companyId, acc.accountNumber, { pcgAccount: c.pcgAccount!, status: "auto_validated", ruleId: c.ruleId, updatedBy: actor.userId });
        }
      }
    }
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "account.map", objectType: "account", objectId: accountNumber, outcome: "success",
      details: { pcgAccount: v.pcgAccount, rule: v.createRule, appliedToOthers: applied },
    });
    await tx.execute(sqlBump(companyId));
    return { appliedToOthers: applied };
  });
}

const sqlBump = (companyId: string) => sql`select app.bump_data_version(${companyId}::uuid)`;

// ───────────── Disponibilité des sources (indicateurs) ─────────────

export async function getAvailableSources(actor: Actor, companyId: string): Promise<Set<DataSource>> {
  return withUser(actor.userId, async (tx) => {
    await authorizeCompany(tx, actor, companyId, "company", "read");
    const r = await availableSources(tx, companyId);
    const s = new Set<DataSource>();
    if (r.tb) s.add("trial_balance");
    if (r.fec) s.add("fec");
    if (r.bank) s.add("bank_transactions");
    return s;
  });
}
