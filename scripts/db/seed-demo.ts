// Données de démonstration FICTIVES, réinitialisables : 1 cabinet, 2 collaborateurs DAF,
// 3 entreprises (services, commerce, artisanat) et leurs dirigeants.
// Usage : npm run db:seed:demo        (crée ou réinitialise la démo)
// Refusé si APP_ENV=production. Aucune donnée réelle. SIREN volontairement vides.
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const env = process.env;
if (env.APP_ENV === "production") {
  console.error("Refusé : le seed de démonstration est interdit en production.");
  process.exit(1);
}
for (const k of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[k]) throw new Error(`${k} manquant`);
}

export const DEMO_PASSWORD = env.DEMO_PASSWORD ?? "DemoDaf-2026-Pilotage";

export const DEMO_USERS = {
  admin: { email: "daf.admin@demo.invalid", fullName: "Camille Martin (démo)" },
  analyst: { email: "daf.analyste@demo.invalid", fullName: "Léa Dubois (démo)" },
  services: { email: "dirigeant.services@demo.invalid", fullName: "Hugo Lefèvre (démo)" },
  commerce: { email: "dirigeante.commerce@demo.invalid", fullName: "Sophie Verdier (démo)" },
  artisan: { email: "dirigeant.artisan@demo.invalid", fullName: "Marc Blanchard (démo)" },
} as const;

const COMPANIES = [
  {
    key: "services",
    legalName: "Atelier Numérique Conseil SAS (démo)",
    tradeName: "Atelier Numérique",
    legalForm: "SAS",
    nafCode: "62.02A",
    sector: "Conseil en systèmes informatiques",
    fiscalYearStartMonth: 1,
    status: "active",
    lead: "analyst",
    advisors: ["analyst"],
  },
  {
    key: "commerce",
    legalName: "Maison Verdier Distribution SARL (démo)",
    tradeName: "Maison Verdier",
    legalForm: "SARL",
    nafCode: "46.34Z",
    sector: "Commerce de gros de boissons",
    fiscalYearStartMonth: 7,
    status: "active",
    lead: "admin",
    advisors: ["admin", "analyst"],
  },
  {
    key: "artisan",
    legalName: "Menuiserie Blanchard EURL (démo)",
    tradeName: null,
    legalForm: "EURL",
    nafCode: "16.23Z",
    sector: "Menuiserie artisanale",
    fiscalYearStartMonth: 1,
    status: "onboarding",
    lead: "admin",
    advisors: ["admin"],
  },
] as const;

const sql = postgres(env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Domaine réservé (RFC 2606) : aucun compte réel ne peut l'utiliser. */
const DEMO_DOMAIN = "@demo.invalid";

async function deleteDemoDomainAuthUsers() {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(DEMO_DOMAIN)) await admin.auth.admin.deleteUser(u.id);
    }
    if (data.users.length < 200) break;
  }
}

/**
 * Supprime la démonstration : entités du cabinet de démo, comptes de démo, et comptes créés par
 * invitation qui ne sont rattachés QU'À des entités de démo (jamais un compte lié à un vrai dossier).
 */
async function reset() {
  await sql.begin(async (tx) => {
    const firms = await tx`select id from app.firms where is_demo`;
    const firmIds = firms.map((f) => f.id as string);
    let userIds: string[] = [];
    if (firmIds.length > 0) {
      const companies = await tx`select id from app.companies where firm_id = any(${firmIds})`;
      const companyIds = companies.map((c) => c.id as string);
      const linked = await tx`
        select user_id as id from app.company_members where company_id = any(${companyIds})
        union select user_id from app.firm_members where firm_id = any(${firmIds})
        union select accepted_by from app.invitations where firm_id = any(${firmIds}) and accepted_by is not null`;
      const exclusive = await tx`
        select u.id from app.users u
        where u.id = any(${linked.map((l) => l.id as string)})
          and not exists (select 1 from app.company_members cm join app.companies c on c.id = cm.company_id
                          where cm.user_id = u.id and not (c.firm_id = any(${firmIds})))
          and not exists (select 1 from app.firm_members fm where fm.user_id = u.id and not (fm.firm_id = any(${firmIds})))`;
      userIds = exclusive.map((e) => e.id as string);
      // Données de la phase 2 (ordre imposé par les clés étrangères).
      for (const table of [
        "bank_transactions", "accounting_entries", "trial_balance_lines", "import_rows", "chart_of_accounts",
        "account_mapping_rules", "column_mapping_templates",
      ]) {
        await tx.unsafe(`delete from app.${table} where company_id = any($1)`, [companyIds]);
      }
      await tx`update app.trial_balances set supersedes_id = null where company_id = any(${companyIds})`;
      await tx`delete from app.trial_balances where company_id = any(${companyIds})`;
      await tx`delete from app.import_files where company_id = any(${companyIds})`;
      await tx`delete from app.bank_accounts where company_id = any(${companyIds})`;
      await tx`delete from app.fiscal_years where company_id = any(${companyIds})`;
      await tx`delete from app.company_advisors where company_id = any(${companyIds})`;
      await tx`delete from app.company_members where company_id = any(${companyIds})`;
      await tx`delete from app.invitations where firm_id = any(${firmIds})`;
      await tx`update app.companies set lead_advisor_id = null where firm_id = any(${firmIds})`;
      await tx`delete from app.companies where firm_id = any(${firmIds})`;
      await tx`delete from app.firm_members where firm_id = any(${firmIds})`;
      await tx`delete from app.firms where id = any(${firmIds})`;
    }
    // Profils de démo, y compris ceux du domaine réservé restés orphelins (exécution interrompue).
    const demoUsers = await tx`
      select u.id from app.users u
      where u.is_demo
         or (u.email like ${"%" + DEMO_DOMAIN}
             and not exists (select 1 from app.company_members cm join app.companies c on c.id = cm.company_id
                             join app.firms f on f.id = c.firm_id where cm.user_id = u.id and not f.is_demo)
             and not exists (select 1 from app.firm_members fm join app.firms f on f.id = fm.firm_id
                             where fm.user_id = u.id and not f.is_demo))`;
    const all = [...new Set([...userIds, ...demoUsers.map((d) => d.id as string)])];
    // Comptes d'authentification supprimés AVANT la validation : en cas d'échec, rien n'est validé.
    for (const id of all) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && error.status !== 404) throw error;
    }
    await tx`delete from app.users where id = any(${all})`;
  });
  // Comptes orphelins du domaine de démonstration (ex. exécution interrompue).
  await deleteDemoDomainAuthUsers();
}

async function seed() {
  const ids: Record<string, string> = {};
  for (const [key, u] of Object.entries(DEMO_USERS)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Création du compte ${u.email} : ${error?.message}`);
    ids[key] = data.user.id;
  }

  await sql.begin(async (tx) => {
    for (const [key, u] of Object.entries(DEMO_USERS)) {
      await tx`insert into app.users (id, email, full_name, is_demo) values (${ids[key]}, ${u.email}, ${u.fullName}, true)`;
    }
    const [firm] = await tx`insert into app.firms (name, is_demo) values ('Cabinet DAF Démo', true) returning id`;
    await tx`insert into app.firm_members (firm_id, user_id, role) values
      (${firm.id}, ${ids.admin}, 'firm_admin'), (${firm.id}, ${ids.analyst}, 'firm_analyst')`;
    for (const c of COMPANIES) {
      const [row] = await tx`
        insert into app.companies (firm_id, legal_name, trade_name, legal_form, naf_code, sector,
          fiscal_year_start_month, status, lead_advisor_id, created_by)
        values (${firm.id}, ${c.legalName}, ${c.tradeName}, ${c.legalForm}, ${c.nafCode}, ${c.sector},
          ${c.fiscalYearStartMonth}, ${c.status}, ${ids[c.lead]}, ${ids.admin})
        returning id`;
      for (const a of c.advisors) {
        await tx`insert into app.company_advisors (company_id, user_id) values (${row.id}, ${ids[a]})`;
      }
      await tx`insert into app.company_members (company_id, user_id, role) values (${row.id}, ${ids[c.key]}, 'client_owner')`;
    }
    await tx`insert into app.audit_log (actor_kind, firm_id, action, outcome, details)
      values ('system', ${firm.id}, 'demo.seed', 'success', '{}'::jsonb)`;
  });
}

try {
  await reset();
  await seed();
  console.log("Démonstration prête. Mot de passe commun :", DEMO_PASSWORD);
  for (const u of Object.values(DEMO_USERS)) console.log(" -", u.email, "—", u.fullName);
} finally {
  await sql.end();
}
