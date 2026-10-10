import "server-only";
import { z } from "zod";
import { can } from "@/domain/permissions/matrix";
import { withUser } from "@/lib/db/tenant";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { insertAudit } from "@/repositories/audit";
import { findBankAccount } from "@/repositories/bank-accounts";
import { findFiscalYear } from "@/repositories/fiscal-years";
import {
  deleteImportData, importDeletionPlan, pendingStorageCleanups, storageKeyInUse, updateStorageCleanup,
  type DeletionPlan, type DeletionResult,
} from "@/repositories/imports";
import { staffMfaSatisfied, type Actor } from "./actor";
import { authorizeCompany } from "./authorize";

/**
 * Suppression définitive d'un import enregistré (balance, FEC, relevé bancaire).
 * Autorisation : administrateur du cabinet ayant accès à l'entreprise, 2FA vérifiée, saisie de
 * « SUPPRIMER ». Le travail SQL est fait par app.delete_import (atomique, journalisé) ; le fichier
 * stocké est supprimé ensuite via une file de nettoyage (aucun orphelin silencieux).
 */

export const DELETE_CONFIRMATION = "SUPPRIMER";
const uuid = z.uuid();

function dbErrorMessage(e: unknown): string {
  const c = (e as { cause?: { message?: string } }).cause;
  return c?.message ?? (e as Error)?.message ?? "";
}

export type DeletionPreview = DeletionPlan & {
  companyName: string;
  fiscalYearLabel: string | null;
  bankAccountLabel: string | null;
  canDelete: boolean;
};

/** Plan de suppression pour la fenêtre de confirmation (personnel du cabinet). */
export async function getDeletionPreview(actor: Actor, companyId: string, importId: string): Promise<DeletionPreview> {
  if (!uuid.safeParse(importId).success) throw new AccessDeniedError("not_found");
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "imports", "read");
    if (access.role !== "firm_admin" && access.role !== "firm_analyst") throw new AccessDeniedError("staff_only");
    let plan: DeletionPlan;
    try {
      plan = await importDeletionPlan(tx, companyId, importId);
    } catch (e) {
      if (dbErrorMessage(e).includes("import_not_found")) throw new AccessDeniedError("not_found");
      throw e;
    }
    const fy = plan.import.fiscalYearId ? await findFiscalYear(tx, companyId, plan.import.fiscalYearId) : null;
    const bank = plan.import.bankAccountId ? await findBankAccount(tx, companyId, plan.import.bankAccountId) : null;
    return {
      ...plan,
      companyName: access.company.tradeName ?? access.company.legalName,
      fiscalYearLabel: fy ? `${fy.label} (${fy.startDate} → ${fy.endDate})` : null,
      bankAccountLabel: bank ? `${bank.label} — ${bank.bankName}` : null,
      canDelete: can(access.role, "imports", "admin") && staffMfaSatisfied(actor),
    };
  });
}

const deleteSchema = z.object({
  confirmation: z.string().trim().default(""),
  reactivatePrevious: z.boolean().default(false),
});

export type DeleteImportOutcome = DeletionResult & {
  fileName: string;
  storage: { removed: number; pending: number; skipped: number };
};

export async function deleteImport(actor: Actor, companyId: string, importId: string, raw: unknown): Promise<DeleteImportOutcome> {
  const parsed = deleteSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new ValidationError("Formulaire invalide");
  const input = parsed.data;
  if (!uuid.safeParse(importId).success) throw new AccessDeniedError("not_found");
  if (input.confirmation !== DELETE_CONFIRMATION) {
    throw new ValidationError("Confirmation incorrecte", { confirmation: [`Saisissez ${DELETE_CONFIRMATION} pour confirmer.`] });
  }
  const { fileName, result } = await withUser(actor.userId, async (tx) => {
    // Matrice : seul firm_admin dispose de imports.admin ; 2FA vérifiée par authorizeCompany.
    await authorizeCompany(tx, actor, companyId, "imports", "admin");
    let plan: DeletionPlan;
    try {
      plan = await importDeletionPlan(tx, companyId, importId);
      return { fileName: plan.import.fileName, result: await deleteImportData(tx, companyId, importId, input.reactivatePrevious) };
    } catch (e) {
      const msg = dbErrorMessage(e);
      if (msg.includes("import_not_found")) throw new AccessDeniedError("not_found");
      if (msg.includes("import_deletion_forbidden")) throw new AccessDeniedError("firm_admin_only");
      const blocked = /import_deletion_blocked: (.*)$/s.exec(msg);
      if (blocked) throw new BusinessRuleError("deletion_blocked", blocked[1]);
      throw e;
    }
  });
  const storage = await processStorageCleanup(actor, companyId);
  return { ...result, fileName, storage };
}

/**
 * Traite les suppressions de fichiers en attente pour l'entreprise. Revérifie juste avant la
 * suppression qu'aucun import ne référence plus l'objet ; un échec est conservé pour reprise.
 */
export async function processStorageCleanup(actor: Actor, companyId: string) {
  const out = { removed: 0, pending: 0, skipped: 0 };
  await withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "imports", "update");
    for (const job of await pendingStorageCleanups(tx, companyId)) {
      if (await storageKeyInUse(tx, companyId, job.storageKey)) {
        await updateStorageCleanup(tx, companyId, job.id, { status: "skipped", lastError: null });
        out.skipped++;
        continue;
      }
      try {
        await getStorage().delete(job.storageKey);
        await updateStorageCleanup(tx, companyId, job.id, { status: "done", attempts: job.attempts + 1, lastError: null });
        out.removed++;
      } catch (e) {
        const message = (e as Error).message.slice(0, 300);
        await updateStorageCleanup(tx, companyId, job.id, { attempts: job.attempts + 1, lastError: message });
        await insertAudit(tx, {
          actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
          action: "storage.cleanup", objectType: "storage_object", objectId: job.id, outcome: "failure",
          details: { attempts: job.attempts + 1 },
        });
        out.pending++;
      }
    }
  });
  return out;
}

/** Nombre de fichiers dont la suppression du stockage reste à faire (affiché aux administrateurs). */
export async function countPendingStorageCleanups(actor: Actor, companyId: string): Promise<number> {
  return withUser(actor.userId, async (tx) => {
    await authorizeCompany(tx, actor, companyId, "imports", "read");
    return (await pendingStorageCleanups(tx, companyId, 1000)).length;
  });
}
