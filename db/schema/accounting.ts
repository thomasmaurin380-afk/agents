import { sql } from "drizzle-orm";
import {
  bigserial, boolean, check, date, index, integer, numeric, smallint, text, timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { app } from "./_schema";
import { users } from "./identity";
import { importFiles } from "./imports";
import { companies } from "./tenancy";

const amount = (name: string) => numeric(name, { precision: 18, scale: 2 });

export const fiscalYearStatus = app.enum("fiscal_year_status", ["open", "closed_provisional", "closed_final"]);
export const dataStatus = app.enum("data_status", ["provisional", "final"]);
export const accountMappingStatus = app.enum("account_mapping_status", ["auto_validated", "to_review", "manual"]);
export const accountRuleMatch = app.enum("account_rule_match", ["exact", "prefix"]);

/** Exercice comptable. Chevauchement interdit par trigger (portable, sans extension). */
export const fiscalYears = app.table(
  "fiscal_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    label: text("label").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: fiscalYearStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [
    index("fiscal_years_company_idx").on(t.companyId, t.startDate),
    check("fiscal_years_dates", sql`${t.endDate} > ${t.startDate} and ${t.endDate} < ${t.startDate} + interval '24 months'`),
  ],
);

/** Plan de comptes de l'entreprise et rattachement au PCG. */
export const chartOfAccounts = app.table(
  "chart_of_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    accountNumber: text("account_number").notNull(),
    label: text("label").notNull().default(""),
    pcgAccount: text("pcg_account"),
    pcgClass: smallint("pcg_class"),
    isAuxiliary: boolean("is_auxiliary").notNull().default(false),
    mappingStatus: accountMappingStatus("mapping_status").notNull(),
    mappingRuleId: uuid("mapping_rule_id"),
    firstSeenImportId: uuid("first_seen_import_id").references(() => importFiles.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => [
    unique("chart_of_accounts_company_account_key").on(t.companyId, t.accountNumber),
    check("chart_of_accounts_pcg", sql`${t.pcgAccount} is null or ${t.pcgAccount} ~ '^[1-8][0-9]{2,}$'`),
  ],
);

/** Règles de rattachement réutilisables (comptes alphanumériques, exceptions). */
export const accountMappingRules = app.table(
  "account_mapping_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    matchType: accountRuleMatch("match_type").notNull(),
    pattern: text("pattern").notNull(),
    pcgAccount: text("pcg_account").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [
    unique("account_mapping_rules_key").on(t.companyId, t.matchType, t.pattern),
    check("account_mapping_rules_pcg", sql`${t.pcgAccount} ~ '^[1-8][0-9]{2,}$'`),
  ],
);

/** Balance importée à une date d'arrêté. Une seule balance « courante » par exercice et date. */
export const trialBalances = app.table(
  "trial_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    fiscalYearId: uuid("fiscal_year_id").notNull().references(() => fiscalYears.id),
    periodEnd: date("period_end").notNull(),
    dataStatus: dataStatus("data_status").notNull(),
    sourceImportId: uuid("source_import_id").notNull().references(() => importFiles.id),
    supersedesId: uuid("supersedes_id"),
    isCurrent: boolean("is_current").notNull().default(true),
    totalDebit: amount("total_debit").notNull(),
    totalCredit: amount("total_credit").notNull(),
    lineCount: integer("line_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trial_balances_current_key").on(t.companyId, t.fiscalYearId, t.periodEnd).where(sql`${t.isCurrent}`),
    check("trial_balances_balanced", sql`${t.totalDebit} = ${t.totalCredit}`),
  ],
);

export const trialBalanceLines = app.table(
  "trial_balance_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    trialBalanceId: uuid("trial_balance_id").notNull().references(() => trialBalances.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    accountNumber: text("account_number").notNull(),
    accountLabel: text("account_label").notNull().default(""),
    openingDebit: amount("opening_debit"),
    openingCredit: amount("opening_credit"),
    movementDebit: amount("movement_debit"),
    movementCredit: amount("movement_credit"),
    closingDebit: amount("closing_debit").notNull(),
    closingCredit: amount("closing_credit").notNull(),
    sourceRow: integer("source_row").notNull(),
  },
  (t) => [
    unique("trial_balance_lines_account_key").on(t.trialBalanceId, t.accountNumber),
    index("trial_balance_lines_company_idx").on(t.companyId, t.accountNumber),
    check("trial_balance_lines_closing", sql`${t.closingDebit} >= 0 and ${t.closingCredit} >= 0`),
  ],
);

/** Écritures issues d'un FEC. Seul le FEC « courant » d'un exercice fait foi (voir import_files). */
export const accountingEntries = app.table(
  "accounting_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    fiscalYearId: uuid("fiscal_year_id").notNull().references(() => fiscalYears.id),
    importFileId: uuid("import_file_id").notNull().references(() => importFiles.id),
    journalCode: text("journal_code").notNull(),
    journalLabel: text("journal_label").notNull().default(""),
    entryNumber: text("entry_number").notNull(),
    entryDate: date("entry_date").notNull(),
    accountNumber: text("account_number").notNull(),
    accountLabel: text("account_label").notNull().default(""),
    auxAccount: text("aux_account"),
    auxLabel: text("aux_label"),
    pieceRef: text("piece_ref").notNull().default(""),
    pieceDate: date("piece_date"),
    label: text("label").notNull().default(""),
    debit: amount("debit").notNull(),
    credit: amount("credit").notNull(),
    lettering: text("lettering"),
    letteringDate: date("lettering_date"),
    validationDate: date("validation_date"),
    currencyAmount: amount("currency_amount"),
    currency: text("currency"),
    sourceRow: integer("source_row").notNull(),
  },
  (t) => [
    index("accounting_entries_import_idx").on(t.importFileId),
    index("accounting_entries_company_account_idx").on(t.companyId, t.fiscalYearId, t.accountNumber),
    index("accounting_entries_company_date_idx").on(t.companyId, t.entryDate),
  ],
);
