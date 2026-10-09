import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { app } from "./_schema";
import { users } from "./identity";
import { importFiles } from "./imports";
import { companies } from "./tenancy";

const amount = (name: string) => numeric(name, { precision: 18, scale: 2 });

export const bankAccounts = app.table(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    bankName: text("bank_name").notNull(),
    label: text("label").notNull(),
    /** 4 derniers caractères de l'IBAN uniquement (minimisation des données). */
    ibanLast4: text("iban_last4"),
    currency: text("currency").notNull().default("EUR"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("bank_accounts_company_idx").on(t.companyId),
    check("bank_accounts_currency_eur", sql`${t.currency} = 'EUR'`),
    check("bank_accounts_iban_last4", sql`${t.ibanLast4} is null or ${t.ibanLast4} ~ '^[0-9A-Z]{4}$'`),
  ],
);

/**
 * Opération bancaire importée. `natural_key_hash` (date, montant, libellé, référence, rang
 * d'occurrence) rend un réimport idempotent : une même opération n'est jamais enregistrée deux fois.
 */
export const bankTransactions = app.table(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    bankAccountId: uuid("bank_account_id").notNull().references(() => bankAccounts.id),
    bookingDate: date("booking_date").notNull(),
    valueDate: date("value_date"),
    amount: amount("amount").notNull(),
    currency: text("currency").notNull().default("EUR"),
    labelRaw: text("label_raw").notNull(),
    labelNormalized: text("label_normalized").notNull(),
    reference: text("reference"),
    balanceAfter: amount("balance_after"),
    sourceImportId: uuid("source_import_id").notNull().references(() => importFiles.id),
    sourceRow: integer("source_row").notNull(),
    naturalKeyHash: text("natural_key_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("bank_transactions_natural_key").on(t.companyId, t.bankAccountId, t.naturalKeyHash),
    index("bank_transactions_account_date_idx").on(t.bankAccountId, t.bookingDate),
  ],
);
