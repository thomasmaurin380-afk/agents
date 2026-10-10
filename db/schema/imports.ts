import { sql } from "drizzle-orm";
import { bigserial, bigint, check, date, index, integer, jsonb, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { app } from "./_schema";
import { users } from "./identity";
import { companies } from "./tenancy";

export const importKind = app.enum("import_kind", ["trial_balance", "fec", "bank_transactions"]);
export const importStatus = app.enum("import_status", ["uploaded", "mapped", "committed", "superseded", "cancelled"]);
export const importRowStatus = app.enum("import_row_status", ["error", "warning", "duplicate", "ignored"]);

/**
 * Fichier importé (couche RAW). Le fichier original est conservé à l'identique dans le stockage
 * (empreinte SHA-256). Un même fichier ne peut être enregistré deux fois pour une entreprise.
 */
export const importFiles = app.table(
  "import_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    kind: importKind("kind").notNull(),
    status: importStatus("status").notNull().default("uploaded"),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    fiscalYearId: uuid("fiscal_year_id"),
    periodEnd: date("period_end"),
    dataStatus: text("data_status"),
    bankAccountId: uuid("bank_account_id"),
    /** Correspondance des colonnes retenue (en-tête, colonnes, mode des montants). */
    mapping: jsonb("mapping"),
    /** Rapport d'import : comptages, totaux, anomalies (500 premières), contrôles. */
    report: jsonb("report"),
    rowCount: integer("row_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    committedBy: uuid("committed_by").references(() => users.id),
  },
  (t) => [
    index("import_files_company_idx").on(t.companyId, t.createdAt),
    uniqueIndex("import_files_same_file_key").on(t.companyId, t.sha256).where(sql`${t.status} in ('committed', 'superseded')`),
    uniqueIndex("import_files_current_fec_key").on(t.companyId, t.fiscalYearId).where(sql`${t.kind} = 'fec' and ${t.status} = 'committed'`),
  ],
);

/** Lignes du fichier ayant fait l'objet d'une anomalie, d'un rejet de doublon ou d'une exclusion. */
export const importRows = app.table(
  "import_rows",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    importFileId: uuid("import_file_id").notNull().references(() => importFiles.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    status: importRowStatus("status").notNull(),
    messages: jsonb("messages").notNull().default([]),
  },
  (t) => [index("import_rows_file_idx").on(t.importFileId, t.rowNumber)],
);

/** Modèle de correspondance de colonnes, réappliqué automatiquement au même format d'export. */
export const columnMappingTemplates = app.table(
  "column_mapping_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    kind: importKind("kind").notNull(),
    headerSignature: text("header_signature").notNull(),
    mapping: jsonb("mapping").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("column_mapping_templates_key").on(t.companyId, t.kind, t.headerSignature)],
);

/**
 * Suppressions de fichiers en attente dans le stockage. Alimentée dans la même transaction que la
 * suppression d'un import (aucun fichier ne peut devenir orphelin silencieusement), puis traitée
 * après validation ; un échec est conservé (tentatives, dernière erreur) et rejoué ultérieurement.
 */
export const storageCleanupQueue = app.table(
  "storage_cleanup_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    storageKey: text("storage_key").notNull(),
    importFileId: uuid("import_file_id"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("storage_cleanup_queue_pending_idx").on(t.companyId, t.status),
    check("storage_cleanup_queue_status", sql`${t.status} in ('pending', 'done', 'skipped')`),
  ],
);
