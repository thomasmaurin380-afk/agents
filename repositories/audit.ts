import { auditLog } from "@/db/schema";
import type { RuntimeTx } from "@/lib/db/tenant";

export type AuditEntry = {
  actorUserId: string | null;
  actorKind: "user" | "job" | "system";
  firmId?: string | null;
  companyId?: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  outcome: "success" | "denied" | "failure";
  /** Jamais de secret, de mot de passe, de jeton ni de contenu de document. */
  details?: Record<string, unknown>;
  requestId?: string;
};

export async function insertAudit(tx: RuntimeTx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: e.actorUserId,
    actorKind: e.actorKind,
    firmId: e.firmId ?? null,
    companyId: e.companyId ?? null,
    action: e.action,
    objectType: e.objectType,
    objectId: e.objectId,
    outcome: e.outcome,
    details: e.details ?? {},
    requestId: e.requestId,
  });
}
