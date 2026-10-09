CREATE TYPE "app"."import_kind" AS ENUM('trial_balance', 'fec', 'bank_transactions');--> statement-breakpoint
CREATE TYPE "app"."import_row_status" AS ENUM('error', 'warning', 'duplicate', 'ignored');--> statement-breakpoint
CREATE TYPE "app"."import_status" AS ENUM('uploaded', 'mapped', 'committed', 'superseded', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."account_mapping_status" AS ENUM('auto_validated', 'to_review', 'manual');--> statement-breakpoint
CREATE TYPE "app"."account_rule_match" AS ENUM('exact', 'prefix');--> statement-breakpoint
CREATE TYPE "app"."data_status" AS ENUM('provisional', 'final');--> statement-breakpoint
CREATE TYPE "app"."fiscal_year_status" AS ENUM('open', 'closed_provisional', 'closed_final');--> statement-breakpoint
CREATE TABLE "app"."column_mapping_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "app"."import_kind" NOT NULL,
	"header_signature" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "column_mapping_templates_key" UNIQUE("company_id","kind","header_signature")
);
--> statement-breakpoint
CREATE TABLE "app"."import_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "app"."import_kind" NOT NULL,
	"status" "app"."import_status" DEFAULT 'uploaded' NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"fiscal_year_id" uuid,
	"period_end" date,
	"data_status" text,
	"bank_account_id" uuid,
	"mapping" jsonb,
	"report" jsonb,
	"row_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"committed_at" timestamp with time zone,
	"committed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "app"."import_rows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"import_file_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"status" "app"."import_row_status" NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."account_mapping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"match_type" "app"."account_rule_match" NOT NULL,
	"pattern" text NOT NULL,
	"pcg_account" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "account_mapping_rules_key" UNIQUE("company_id","match_type","pattern"),
	CONSTRAINT "account_mapping_rules_pcg" CHECK ("app"."account_mapping_rules"."pcg_account" ~ '^[1-8][0-9]{2,}$')
);
--> statement-breakpoint
CREATE TABLE "app"."accounting_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"import_file_id" uuid NOT NULL,
	"journal_code" text NOT NULL,
	"journal_label" text DEFAULT '' NOT NULL,
	"entry_number" text NOT NULL,
	"entry_date" date NOT NULL,
	"account_number" text NOT NULL,
	"account_label" text DEFAULT '' NOT NULL,
	"aux_account" text,
	"aux_label" text,
	"piece_ref" text DEFAULT '' NOT NULL,
	"piece_date" date,
	"label" text DEFAULT '' NOT NULL,
	"debit" numeric(18, 2) NOT NULL,
	"credit" numeric(18, 2) NOT NULL,
	"lettering" text,
	"lettering_date" date,
	"validation_date" date,
	"currency_amount" numeric(18, 2),
	"currency" text,
	"source_row" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"pcg_account" text,
	"pcg_class" smallint,
	"is_auxiliary" boolean DEFAULT false NOT NULL,
	"mapping_status" "app"."account_mapping_status" NOT NULL,
	"mapping_rule_id" uuid,
	"first_seen_import_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "chart_of_accounts_company_account_key" UNIQUE("company_id","account_number"),
	CONSTRAINT "chart_of_accounts_pcg" CHECK ("app"."chart_of_accounts"."pcg_account" is null or "app"."chart_of_accounts"."pcg_account" ~ '^[1-8][0-9]{2,}$')
);
--> statement-breakpoint
CREATE TABLE "app"."fiscal_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "app"."fiscal_year_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "fiscal_years_dates" CHECK ("app"."fiscal_years"."end_date" > "app"."fiscal_years"."start_date" and "app"."fiscal_years"."end_date" < "app"."fiscal_years"."start_date" + interval '24 months')
);
--> statement-breakpoint
CREATE TABLE "app"."trial_balance_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trial_balance_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"account_label" text DEFAULT '' NOT NULL,
	"opening_debit" numeric(18, 2),
	"opening_credit" numeric(18, 2),
	"movement_debit" numeric(18, 2),
	"movement_credit" numeric(18, 2),
	"closing_debit" numeric(18, 2) NOT NULL,
	"closing_credit" numeric(18, 2) NOT NULL,
	"source_row" integer NOT NULL,
	CONSTRAINT "trial_balance_lines_account_key" UNIQUE("trial_balance_id","account_number"),
	CONSTRAINT "trial_balance_lines_closing" CHECK ("app"."trial_balance_lines"."closing_debit" >= 0 and "app"."trial_balance_lines"."closing_credit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."trial_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"period_end" date NOT NULL,
	"data_status" "app"."data_status" NOT NULL,
	"source_import_id" uuid NOT NULL,
	"supersedes_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"total_debit" numeric(18, 2) NOT NULL,
	"total_credit" numeric(18, 2) NOT NULL,
	"line_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_balances_balanced" CHECK ("app"."trial_balances"."total_debit" = "app"."trial_balances"."total_credit")
);
--> statement-breakpoint
CREATE TABLE "app"."bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"label" text NOT NULL,
	"iban_last4" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	CONSTRAINT "bank_accounts_currency_eur" CHECK ("app"."bank_accounts"."currency" = 'EUR'),
	CONSTRAINT "bank_accounts_iban_last4" CHECK ("app"."bank_accounts"."iban_last4" is null or "app"."bank_accounts"."iban_last4" ~ '^[0-9A-Z]{4}$')
);
--> statement-breakpoint
CREATE TABLE "app"."bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"label_raw" text NOT NULL,
	"label_normalized" text NOT NULL,
	"reference" text,
	"balance_after" numeric(18, 2),
	"source_import_id" uuid NOT NULL,
	"source_row" integer NOT NULL,
	"natural_key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transactions_natural_key" UNIQUE("company_id","bank_account_id","natural_key_hash")
);
--> statement-breakpoint
ALTER TABLE "app"."column_mapping_templates" ADD CONSTRAINT "column_mapping_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."column_mapping_templates" ADD CONSTRAINT "column_mapping_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."import_files" ADD CONSTRAINT "import_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."import_files" ADD CONSTRAINT "import_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."import_files" ADD CONSTRAINT "import_files_committed_by_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."import_rows" ADD CONSTRAINT "import_rows_import_file_id_import_files_id_fk" FOREIGN KEY ("import_file_id") REFERENCES "app"."import_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."import_rows" ADD CONSTRAINT "import_rows_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."accounting_entries" ADD CONSTRAINT "accounting_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."accounting_entries" ADD CONSTRAINT "accounting_entries_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "app"."fiscal_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."accounting_entries" ADD CONSTRAINT "accounting_entries_import_file_id_import_files_id_fk" FOREIGN KEY ("import_file_id") REFERENCES "app"."import_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_first_seen_import_id_import_files_id_fk" FOREIGN KEY ("first_seen_import_id") REFERENCES "app"."import_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fiscal_years" ADD CONSTRAINT "fiscal_years_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fiscal_years" ADD CONSTRAINT "fiscal_years_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trial_balance_lines" ADD CONSTRAINT "trial_balance_lines_trial_balance_id_trial_balances_id_fk" FOREIGN KEY ("trial_balance_id") REFERENCES "app"."trial_balances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trial_balance_lines" ADD CONSTRAINT "trial_balance_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trial_balances" ADD CONSTRAINT "trial_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trial_balances" ADD CONSTRAINT "trial_balances_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "app"."fiscal_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."trial_balances" ADD CONSTRAINT "trial_balances_source_import_id_import_files_id_fk" FOREIGN KEY ("source_import_id") REFERENCES "app"."import_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bank_transactions" ADD CONSTRAINT "bank_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "app"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bank_transactions" ADD CONSTRAINT "bank_transactions_source_import_id_import_files_id_fk" FOREIGN KEY ("source_import_id") REFERENCES "app"."import_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_files_company_idx" ON "app"."import_files" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_files_same_file_key" ON "app"."import_files" USING btree ("company_id","sha256") WHERE "app"."import_files"."status" in ('committed', 'superseded');--> statement-breakpoint
CREATE UNIQUE INDEX "import_files_current_fec_key" ON "app"."import_files" USING btree ("company_id","fiscal_year_id") WHERE "app"."import_files"."kind" = 'fec' and "app"."import_files"."status" = 'committed';--> statement-breakpoint
CREATE INDEX "import_rows_file_idx" ON "app"."import_rows" USING btree ("import_file_id","row_number");--> statement-breakpoint
CREATE INDEX "accounting_entries_import_idx" ON "app"."accounting_entries" USING btree ("import_file_id");--> statement-breakpoint
CREATE INDEX "accounting_entries_company_account_idx" ON "app"."accounting_entries" USING btree ("company_id","fiscal_year_id","account_number");--> statement-breakpoint
CREATE INDEX "accounting_entries_company_date_idx" ON "app"."accounting_entries" USING btree ("company_id","entry_date");--> statement-breakpoint
CREATE INDEX "fiscal_years_company_idx" ON "app"."fiscal_years" USING btree ("company_id","start_date");--> statement-breakpoint
CREATE INDEX "trial_balance_lines_company_idx" ON "app"."trial_balance_lines" USING btree ("company_id","account_number");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_balances_current_key" ON "app"."trial_balances" USING btree ("company_id","fiscal_year_id","period_end") WHERE "app"."trial_balances"."is_current";--> statement-breakpoint
CREATE INDEX "bank_accounts_company_idx" ON "app"."bank_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_account_date_idx" ON "app"."bank_transactions" USING btree ("bank_account_id","booking_date");