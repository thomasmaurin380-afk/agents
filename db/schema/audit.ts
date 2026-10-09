import { bigserial, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { app } from "./_schema";

export const auditActorKind = app.enum("audit_actor_kind", ["user", "job", "system"]);
export const auditOutcome = app.enum("audit_outcome", ["success", "denied", "failure"]);

/**
 * Journal d'audit append-only : UPDATE/DELETE interdits par trigger (y compris pour le
 * propriétaire). `details` ne contient jamais de secret ni de contenu de document.
 */
export const auditLog = app.table(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    actorKind: auditActorKind("actor_kind").notNull(),
    firmId: uuid("firm_id"),
    companyId: uuid("company_id"),
    action: text("action").notNull(),
    objectType: text("object_type"),
    objectId: text("object_id"),
    outcome: auditOutcome("outcome").notNull(),
    details: jsonb("details").notNull().default({}),
    requestId: text("request_id"),
  },
  (t) => [
    index("audit_log_company_at_idx").on(t.companyId, t.at),
    index("audit_log_firm_at_idx").on(t.firmId, t.at),
  ],
);
