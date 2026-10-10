CREATE TABLE "app"."sig_account_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"rule_set_code" text NOT NULL,
	"account_number" text NOT NULL,
	"pcg_account" text,
	"proposed_line" text,
	"line" text NOT NULL,
	"justification" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"replaced_at" timestamp with time zone,
	"replaced_by" uuid,
	CONSTRAINT "sig_account_overrides_justification" CHECK (length(btrim("app"."sig_account_overrides"."justification")) >= 5),
	CONSTRAINT "sig_account_overrides_rule_set" CHECK ("app"."sig_account_overrides"."rule_set_code" in ('PCG-2024', 'PCG-2025'))
);
--> statement-breakpoint
CREATE TABLE "app"."sig_rule_set_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"rule_set_code" text NOT NULL,
	"rule_set_version" integer NOT NULL,
	"rules_hash" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sig_rule_set_approvals_key" UNIQUE("firm_id","rule_set_code","rules_hash")
);
--> statement-breakpoint
CREATE TABLE "app"."sig_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fiscal_year_id" uuid NOT NULL,
	"period_kind" text NOT NULL,
	"period_month" smallint,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"source" text NOT NULL,
	"source_choice" text NOT NULL,
	"source_justification" text,
	"source_refs" jsonb NOT NULL,
	"rule_set_code" text NOT NULL,
	"rule_set_version" integer NOT NULL,
	"rules_hash" text NOT NULL,
	"engine_version" text NOT NULL,
	"data_fingerprint" text NOT NULL,
	"data_version" bigint NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'validated' NOT NULL,
	"validated_by" uuid NOT NULL,
	"validated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	CONSTRAINT "sig_snapshots_period_kind" CHECK ("app"."sig_snapshots"."period_kind" in ('fiscal_year', 'ytd', 'month')),
	CONSTRAINT "sig_snapshots_period_month" CHECK (("app"."sig_snapshots"."period_kind" = 'fiscal_year') = ("app"."sig_snapshots"."period_month" is null)),
	CONSTRAINT "sig_snapshots_source" CHECK ("app"."sig_snapshots"."source" in ('trial_balance', 'fec')),
	CONSTRAINT "sig_snapshots_source_choice" CHECK ("app"."sig_snapshots"."source_choice" = 'auto' or ("app"."sig_snapshots"."source_choice" = 'explicit' and length(btrim(coalesce("app"."sig_snapshots"."source_justification", ''))) >= 5)),
	CONSTRAINT "sig_snapshots_status" CHECK ("app"."sig_snapshots"."status" in ('validated', 'published')),
	CONSTRAINT "sig_snapshots_published" CHECK (("app"."sig_snapshots"."status" = 'published') = ("app"."sig_snapshots"."published_at" is not null and "app"."sig_snapshots"."published_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "app"."sig_account_overrides" ADD CONSTRAINT "sig_account_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_account_overrides" ADD CONSTRAINT "sig_account_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_account_overrides" ADD CONSTRAINT "sig_account_overrides_replaced_by_users_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_rule_set_approvals" ADD CONSTRAINT "sig_rule_set_approvals_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "app"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_rule_set_approvals" ADD CONSTRAINT "sig_rule_set_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_snapshots" ADD CONSTRAINT "sig_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_snapshots" ADD CONSTRAINT "sig_snapshots_fiscal_year_id_fiscal_years_id_fk" FOREIGN KEY ("fiscal_year_id") REFERENCES "app"."fiscal_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_snapshots" ADD CONSTRAINT "sig_snapshots_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sig_snapshots" ADD CONSTRAINT "sig_snapshots_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sig_account_overrides_active_key" ON "app"."sig_account_overrides" USING btree ("company_id","rule_set_code","account_number") WHERE "app"."sig_account_overrides"."replaced_at" is null;--> statement-breakpoint
CREATE INDEX "sig_snapshots_company_idx" ON "app"."sig_snapshots" USING btree ("company_id","fiscal_year_id","validated_at");