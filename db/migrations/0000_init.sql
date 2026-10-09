CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."firm_role" AS ENUM('firm_admin', 'firm_analyst');--> statement-breakpoint
CREATE TYPE "app"."client_role" AS ENUM('client_owner', 'client_member', 'client_readonly');--> statement-breakpoint
CREATE TYPE "app"."company_status" AS ENUM('onboarding', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "app"."invitation_role" AS ENUM('firm_admin', 'firm_analyst', 'client_owner', 'client_member', 'client_readonly');--> statement-breakpoint
CREATE TYPE "app"."audit_actor_kind" AS ENUM('user', 'job', 'system');--> statement-breakpoint
CREATE TYPE "app"."audit_outcome" AS ENUM('success', 'denied', 'failure');--> statement-breakpoint
CREATE TABLE "app"."firm_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app"."firm_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firm_members_firm_user_key" UNIQUE("firm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"siren" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("app"."users"."email" = lower("app"."users"."email"))
);
--> statement-breakpoint
CREATE TABLE "app"."companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"siren" text,
	"legal_form" text,
	"naf_code" text,
	"sector" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"fiscal_year_start_month" smallint DEFAULT 1 NOT NULL,
	"status" "app"."company_status" DEFAULT 'onboarding' NOT NULL,
	"enabled_modules" text[] DEFAULT '{}'::text[] NOT NULL,
	"lead_advisor_id" uuid,
	"data_version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_firm_siren_key" UNIQUE("firm_id","siren"),
	CONSTRAINT "companies_currency_eur" CHECK ("app"."companies"."currency" = 'EUR'),
	CONSTRAINT "companies_fy_month" CHECK ("app"."companies"."fiscal_year_start_month" between 1 and 12),
	CONSTRAINT "companies_siren_format" CHECK ("app"."companies"."siren" is null or "app"."companies"."siren" ~ '^[0-9]{9}$'),
	CONSTRAINT "companies_legal_name_not_blank" CHECK (length(trim("app"."companies"."legal_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."company_advisors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_advisors_company_user_key" UNIQUE("company_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."company_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app"."client_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_members_company_user_key" UNIQUE("company_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"company_id" uuid,
	"email" text NOT NULL,
	"role" "app"."invitation_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "invitations_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "invitations_email_lowercase" CHECK ("app"."invitations"."email" = lower("app"."invitations"."email")),
	CONSTRAINT "invitations_scope" CHECK (("app"."invitations"."role" in ('firm_admin','firm_analyst') and "app"."invitations"."company_id" is null)
       or ("app"."invitations"."role" in ('client_owner','client_member','client_readonly') and "app"."invitations"."company_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" "app"."audit_actor_kind" NOT NULL,
	"firm_id" uuid,
	"company_id" uuid,
	"action" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"outcome" "app"."audit_outcome" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text
);
--> statement-breakpoint
ALTER TABLE "app"."firm_members" ADD CONSTRAINT "firm_members_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "app"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."firm_members" ADD CONSTRAINT "firm_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD CONSTRAINT "companies_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "app"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD CONSTRAINT "companies_lead_advisor_id_users_id_fk" FOREIGN KEY ("lead_advisor_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."companies" ADD CONSTRAINT "companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."company_advisors" ADD CONSTRAINT "company_advisors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."company_advisors" ADD CONSTRAINT "company_advisors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."company_members" ADD CONSTRAINT "company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "app"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "firm_members_user_idx" ON "app"."firm_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "companies_firm_idx" ON "app"."companies" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "company_advisors_user_idx" ON "app"."company_advisors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "company_members_user_idx" ON "app"."company_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_company_idx" ON "app"."invitations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "audit_log_company_at_idx" ON "app"."audit_log" USING btree ("company_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_firm_at_idx" ON "app"."audit_log" USING btree ("firm_id","at");