import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, jsonb, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { app } from "./_schema";
import { fiscalYears } from "./accounting";
import { firms, users } from "./identity";
import { companies } from "./tenancy";

/**
 * Exception de classement SIG propre à une entreprise (compte → rubrique), par référentiel.
 * Jamais modifiée : une nouvelle décision remplace la précédente (historique conservé).
 */
export const sigAccountOverrides = app.table(
  "sig_account_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    ruleSetCode: text("rule_set_code").notNull(),
    accountNumber: text("account_number").notNull(),
    pcgAccount: text("pcg_account"),
    proposedLine: text("proposed_line"),
    line: text("line").notNull(),
    justification: text("justification").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    replacedBy: uuid("replaced_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("sig_account_overrides_active_key").on(t.companyId, t.ruleSetCode, t.accountNumber).where(sql`${t.replacedAt} is null`),
    check("sig_account_overrides_justification", sql`length(btrim(${t.justification})) >= 5`),
    check("sig_account_overrides_rule_set", sql`${t.ruleSetCode} in ('PCG-2024', 'PCG-2025')`),
  ],
);

/** Validation, par l'administrateur du cabinet, d'une version précise d'un référentiel SIG. */
export const sigRuleSetApprovals = app.table(
  "sig_rule_set_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    ruleSetCode: text("rule_set_code").notNull(),
    ruleSetVersion: integer("rule_set_version").notNull(),
    rulesHash: text("rules_hash").notNull(),
    approvedBy: uuid("approved_by").notNull().references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("sig_rule_set_approvals_key").on(t.firmId, t.ruleSetCode, t.rulesHash)],
);

/**
 * Version figée des SIG (immuable) : seul le passage « validé → publié » est autorisé.
 * `content` contient le tableau, le détail par compte, les contrôles et la comparaison N-1.
 */
export const sigSnapshots = app.table(
  "sig_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    fiscalYearId: uuid("fiscal_year_id").notNull().references(() => fiscalYears.id),
    periodKind: text("period_kind").notNull(),
    periodMonth: smallint("period_month"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    source: text("source").notNull(),
    sourceChoice: text("source_choice").notNull(),
    sourceJustification: text("source_justification"),
    sourceRefs: jsonb("source_refs").notNull(),
    ruleSetCode: text("rule_set_code").notNull(),
    ruleSetVersion: integer("rule_set_version").notNull(),
    rulesHash: text("rules_hash").notNull(),
    engineVersion: text("engine_version").notNull(),
    dataFingerprint: text("data_fingerprint").notNull(),
    dataVersion: bigint("data_version", { mode: "number" }).notNull(),
    content: jsonb("content").notNull(),
    contentHash: text("content_hash").notNull(),
    status: text("status").notNull().default("validated"),
    validatedBy: uuid("validated_by").notNull().references(() => users.id),
    validatedAt: timestamp("validated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid("published_by").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("sig_snapshots_company_idx").on(t.companyId, t.fiscalYearId, t.validatedAt),
    check("sig_snapshots_period_kind", sql`${t.periodKind} in ('fiscal_year', 'ytd', 'month')`),
    check("sig_snapshots_period_month", sql`(${t.periodKind} = 'fiscal_year') = (${t.periodMonth} is null)`),
    check("sig_snapshots_source", sql`${t.source} in ('trial_balance', 'fec')`),
    check("sig_snapshots_source_choice", sql`${t.sourceChoice} = 'auto' or (${t.sourceChoice} = 'explicit' and length(btrim(coalesce(${t.sourceJustification}, ''))) >= 5)`),
    check("sig_snapshots_status", sql`${t.status} in ('validated', 'published')`),
    check("sig_snapshots_published", sql`(${t.status} = 'published') = (${t.publishedAt} is not null and ${t.publishedBy} is not null)`),
  ],
);
