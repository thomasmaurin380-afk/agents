import { sql } from "drizzle-orm";
import { boolean, check, index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { app } from "./_schema";

export const firmRole = app.enum("firm_role", ["firm_admin", "firm_analyst"]);

/** Cabinet DAF. Un seul au MVP, plusieurs possibles en SaaS. */
export const firms = app.table("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  siren: text("siren"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Profil applicatif. `id` = identifiant du compte d'authentification (Supabase Auth),
 * volontairement sans clé étrangère vers `auth.users` (portabilité, D-01).
 */
export const users = app.table(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_email_key").on(t.email),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export const firmMembers = app.table(
  "firm_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: firmRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("firm_members_firm_user_key").on(t.firmId, t.userId),
    index("firm_members_user_idx").on(t.userId),
  ],
);
