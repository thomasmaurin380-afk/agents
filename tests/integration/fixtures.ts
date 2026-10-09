import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { integrationUrls } from "./db-url";

export type Sql = ReturnType<typeof postgres>;

export function ownerSql(): Sql {
  return postgres(integrationUrls().it, { max: 4, onnotice: () => {} });
}

/** Exécute `fn` comme le fait l'application : rôle app_runtime + app.user_id, limités à la transaction. */
export async function asUser<T>(
  sql: Sql,
  userId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`set local role app_runtime`;
    await tx`select set_config('app.user_id', ${userId ?? ""}, true)`;
    return fn(tx);
  })) as T;
}

/**
 * Deux cabinets, trois entreprises, des utilisateurs de chaque profil.
 *   Cabinet 1 : admin1 (firm_admin), analyst1 (firm_analyst, affecté à C1 seulement)
 *               C1 (client1 dirigeant, disabledClient désactivé), C2 (client2 dirigeant)
 *   Cabinet 2 : admin2 ; C3 (client3)
 */
export async function createWorld(sql: Sql) {
  const tag = randomUUID().slice(0, 8);
  const u = {
    admin1: randomUUID(), analyst1: randomUUID(), client1: randomUUID(), client2: randomUUID(),
    admin2: randomUUID(), client3: randomUUID(), disabledClient: randomUUID(), orphan: randomUUID(),
  };
  const f1 = randomUUID();
  const f2 = randomUUID();
  const c = { c1: randomUUID(), c2: randomUUID(), c3: randomUUID() };
  await sql.begin(async (tx) => {
    for (const [k, id] of Object.entries(u)) {
      await tx`insert into app.users (id, email, full_name, disabled_at)
        values (${id}, ${`${k.toLowerCase()}.${tag}@test.invalid`}, ${k}, ${k === "disabledClient" ? new Date() : null})`;
    }
    await tx`insert into app.firms (id, name) values (${f1}, ${"Cabinet 1 " + tag}), (${f2}, ${"Cabinet 2 " + tag})`;
    await tx`insert into app.firm_members (firm_id, user_id, role) values
      (${f1}, ${u.admin1}, 'firm_admin'), (${f1}, ${u.analyst1}, 'firm_analyst'), (${f2}, ${u.admin2}, 'firm_admin')`;
    await tx`insert into app.companies (id, firm_id, legal_name, lead_advisor_id, status) values
      (${c.c1}, ${f1}, 'Entreprise C1', ${u.analyst1}, 'active'),
      (${c.c2}, ${f1}, 'Entreprise C2', ${u.admin1}, 'active'),
      (${c.c3}, ${f2}, 'Entreprise C3', ${u.admin2}, 'active')`;
    await tx`insert into app.company_advisors (company_id, user_id) values (${c.c1}, ${u.analyst1})`;
    await tx`insert into app.company_members (company_id, user_id, role) values
      (${c.c1}, ${u.client1}, 'client_owner'), (${c.c2}, ${u.client2}, 'client_owner'),
      (${c.c3}, ${u.client3}, 'client_owner'), (${c.c1}, ${u.disabledClient}, 'client_member')`;
  });
  return { u, f1, f2, c, tag };
}

export type World = Awaited<ReturnType<typeof createWorld>>;
