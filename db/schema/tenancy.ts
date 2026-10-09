import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { app } from "./_schema";
import { firms, users } from "./identity";

export const companyStatus = app.enum("company_status", [
  "onboarding",
  "active",
  "paused",
  "archived",
]);

export const clientRole = app.enum("client_role", [
  "client_owner",
  "client_member",
  "client_readonly",
]);

export const invitationRole = app.enum("invitation_role", [
  "firm_admin",
  "firm_analyst",
  "client_owner",
  "client_member",
  "client_readonly",
]);

/** Entreprise cliente : racine de l'isolation multi-tenant. */
export const companies = app.table(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    siren: text("siren"),
    legalForm: text("legal_form"),
    nafCode: text("naf_code"),
    sector: text("sector"),
    currency: text("currency").notNull().default("EUR"),
    fiscalYearStartMonth: smallint("fiscal_year_start_month").notNull().default(1),
    status: companyStatus("status").notNull().default("onboarding"),
    enabledModules: text("enabled_modules")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    leadAdvisorId: uuid("lead_advisor_id").references(() => users.id),
    /** Incrémenté à chaque import/correction : invalide les calculs en cache. */
    dataVersion: bigint("data_version", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("companies_firm_idx").on(t.firmId),
    unique("companies_firm_siren_key").on(t.firmId, t.siren),
    check("companies_currency_eur", sql`${t.currency} = 'EUR'`),
    check("companies_fy_month", sql`${t.fiscalYearStartMonth} between 1 and 12`),
    check("companies_siren_format", sql`${t.siren} is null or ${t.siren} ~ '^[0-9]{9}$'`),
    check("companies_legal_name_not_blank", sql`length(trim(${t.legalName})) > 0`),
  ],
);

/** Accès d'un utilisateur client à une entreprise. */
export const companyMembers = app.table(
  "company_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: clientRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("company_members_company_user_key").on(t.companyId, t.userId),
    index("company_members_user_idx").on(t.userId),
  ],
);

/** Affectation d'un collaborateur du cabinet à une entreprise (le firm_admin voit tout). */
export const companyAdvisors = app.table(
  "company_advisors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("company_advisors_company_user_key").on(t.companyId, t.userId),
    index("company_advisors_user_idx").on(t.userId),
  ],
);

/** Invitation à usage unique ; seul le hash SHA-256 du jeton est stocké (D-14). */
export const invitations = app.table(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    companyId: uuid("company_id").references(() => companies.id),
    email: text("email").notNull(),
    role: invitationRole("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    unique("invitations_token_hash_key").on(t.tokenHash),
    index("invitations_company_idx").on(t.companyId),
    check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check(
      "invitations_scope",
      sql`(${t.role} in ('firm_admin','firm_analyst') and ${t.companyId} is null)
       or (${t.role} in ('client_owner','client_member','client_readonly') and ${t.companyId} is not null)`,
    ),
  ],
);
