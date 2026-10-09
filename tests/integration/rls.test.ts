// Isolation multi-tenant prouvée au niveau SQL : ces tests n'utilisent PAS le code applicatif,
// seulement le rôle app_runtime et les politiques RLS (barrière n° 3, docs/architecture.md § 5).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createWorld, ownerSql, type World } from "./fixtures";

const sql = ownerSql();
let w: World;

beforeAll(async () => {
  w = await createWorld(sql);
});
afterAll(async () => {
  await sql.end();
});

const companyIds = async (userId: string | null) =>
  (await asUser(sql, userId, (tx) => tx`select id from app.companies`)).map((r) => r.id as string);

describe("RLS — lecture des entreprises", () => {
  it("un dirigeant ne voit que son entreprise", async () => {
    expect(await companyIds(w.u.client1)).toEqual([w.c.c1]);
    expect(await companyIds(w.u.client3)).toEqual([w.c.c3]);
  });

  it("un dirigeant ne peut pas lire une autre entreprise, même par identifiant", async () => {
    const rows = await asUser(sql, w.u.client1, (tx) => tx`select * from app.companies where id = ${w.c.c2}`);
    expect(rows).toHaveLength(0);
  });

  it("un collaborateur DAF ne voit que les entreprises auxquelles il est affecté", async () => {
    expect(await companyIds(w.u.analyst1)).toEqual([w.c.c1]);
  });

  it("l'administrateur DAF voit tout son cabinet et rien d'un autre cabinet", async () => {
    expect((await companyIds(w.u.admin1)).sort()).toEqual([w.c.c1, w.c.c2].sort());
    expect(await companyIds(w.u.admin2)).toEqual([w.c.c3]);
  });

  it("sans utilisateur (anonyme) ou utilisateur inconnu : rien", async () => {
    expect(await companyIds(null)).toEqual([]);
    expect(await companyIds(w.u.orphan)).toEqual([]);
  });

  it("un utilisateur désactivé ne voit plus rien", async () => {
    expect(await companyIds(w.u.disabledClient)).toEqual([]);
  });

  it("un client d'une entreprise archivée perd l'accès", async () => {
    await sql`update app.companies set status = 'archived' where id = ${w.c.c2}`;
    expect(await companyIds(w.u.client2)).toEqual([]);
    expect((await companyIds(w.u.admin1)).sort()).toEqual([w.c.c1, w.c.c2].sort());
    await sql`update app.companies set status = 'active' where id = ${w.c.c2}`;
  });
});

describe("RLS — écritures", () => {
  it("un dirigeant ne peut pas modifier son entreprise (0 ligne affectée)", async () => {
    const r = await asUser(sql, w.u.client1, (tx) => tx`update app.companies set legal_name = 'X' where id = ${w.c.c1}`);
    expect(r.count).toBe(0);
  });

  it("un admin ne peut pas modifier l'entreprise d'un autre cabinet", async () => {
    const r = await asUser(sql, w.u.admin2, (tx) => tx`update app.companies set legal_name = 'X' where id = ${w.c.c1}`);
    expect(r.count).toBe(0);
  });

  it("personne ne peut déplacer une entreprise vers un autre cabinet (privilège de colonne)", async () => {
    await expect(
      asUser(sql, w.u.admin1, (tx) => tx`update app.companies set firm_id = ${w.f2} where id = ${w.c.c1}`),
    ).rejects.toThrow(/permission denied/);
  });

  it("un collaborateur ne peut pas créer d'entreprise ; un admin uniquement dans son cabinet", async () => {
    await expect(
      asUser(sql, w.u.analyst1, (tx) => tx`insert into app.companies (firm_id, legal_name) values (${w.f1}, 'N')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(sql, w.u.admin1, (tx) => tx`insert into app.companies (firm_id, legal_name) values (${w.f2}, 'N')`),
    ).rejects.toThrow(/row-level security/);
    // Pas de RETURNING : la ligne insérée n'est pas encore visible des fonctions d'accès (STABLE)
    // dans la même instruction ; l'application génère donc l'identifiant elle-même.
    const id = randomUUID();
    await asUser(sql, w.u.admin1, (tx) => tx`insert into app.companies (id, firm_id, legal_name) values (${id}, ${w.f1}, 'Nouvelle')`);
    const visible = await asUser(sql, w.u.admin1, (tx) => tx`select id from app.companies where id = ${id}`);
    expect(visible).toHaveLength(1);
  });

  it("le référent doit appartenir au cabinet de l'entreprise", async () => {
    await expect(
      asUser(sql, w.u.admin1, (tx) => tx`update app.companies set lead_advisor_id = ${w.u.admin2} where id = ${w.c.c1}`),
    ).rejects.toThrow(/row-level security/);
  });

  it("un admin ne peut pas affecter un collaborateur d'un autre cabinet", async () => {
    await expect(
      asUser(sql, w.u.admin1, (tx) => tx`insert into app.company_advisors (company_id, user_id) values (${w.c.c2}, ${w.u.admin2})`),
    ).rejects.toThrow(/row-level security/);
  });

  it("un dirigeant ne peut pas s'ajouter à une autre entreprise", async () => {
    await expect(
      asUser(sql, w.u.client1, (tx) =>
        tx`insert into app.company_members (company_id, user_id, role) values (${w.c.c2}, ${w.u.client1}, 'client_owner')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("un utilisateur ne peut pas modifier son e-mail ni se réactiver", async () => {
    await expect(
      asUser(sql, w.u.client1, (tx) => tx`update app.users set email = 'x@y.z' where id = ${w.u.client1}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(sql, w.u.disabledClient, (tx) => tx`update app.users set disabled_at = null where id = ${w.u.disabledClient}`),
    ).rejects.toThrow(/permission denied/);
  });

  it("un utilisateur peut modifier son propre nom, pas celui d'un autre", async () => {
    const own = await asUser(sql, w.u.client1, (tx) => tx`update app.users set full_name = 'Moi' where id = ${w.u.client1}`);
    expect(own.count).toBe(1);
    const other = await asUser(sql, w.u.client1, (tx) => tx`update app.users set full_name = 'Pirate' where id = ${w.u.client2}`);
    expect(other.count).toBe(0);
  });
});

describe("RLS — profils, cabinets, appartenances", () => {
  it("un dirigeant voit son profil et son DAF référent, pas les autres clients", async () => {
    const ids = (await asUser(sql, w.u.client1, (tx) => tx`select id from app.users`)).map((r) => r.id);
    expect(ids).toContain(w.u.client1);
    expect(ids).toContain(w.u.analyst1);
    expect(ids).not.toContain(w.u.client2);
    expect(ids).not.toContain(w.u.admin2);
    expect(ids).not.toContain(w.u.client3);
  });

  it("un dirigeant voit le nom de son cabinet, pas l'autre cabinet", async () => {
    const ids = (await asUser(sql, w.u.client1, (tx) => tx`select id from app.firms`)).map((r) => r.id);
    expect(ids).toEqual([w.f1]);
  });

  it("un dirigeant ne voit pas les autres membres ni les affectations du cabinet", async () => {
    const members = await asUser(sql, w.u.client1, (tx) => tx`select user_id from app.company_members`);
    expect(members.map((m) => m.user_id)).toEqual([w.u.client1]);
    const fm = await asUser(sql, w.u.client1, (tx) => tx`select * from app.firm_members`);
    expect(fm).toHaveLength(0);
  });

  it("un dirigeant ne lit aucune invitation", async () => {
    await sql`insert into app.invitations (firm_id, company_id, email, role, token_hash, expires_at, created_by)
      values (${w.f1}, ${w.c.c1}, ${`x.${w.tag}@test.invalid`}, 'client_member', ${"h-" + w.tag}, now() + interval '1 day', ${w.u.admin1})`;
    expect(await asUser(sql, w.u.client1, (tx) => tx`select * from app.invitations`)).toHaveLength(0);
    expect(await asUser(sql, w.u.analyst1, (tx) => tx`select * from app.invitations`)).toHaveLength(0);
    expect((await asUser(sql, w.u.admin1, (tx) => tx`select * from app.invitations where firm_id = ${w.f1}`)).length).toBe(1);
  });
});

describe("Journal d'audit", () => {
  it("est en ajout seul, y compris pour le propriétaire des tables", async () => {
    await sql`insert into app.audit_log (actor_kind, action, outcome) values ('system', 'test', 'success')`;
    await expect(sql`update app.audit_log set action = 'x'`).rejects.toThrow(/ajout seul/);
    await expect(sql`delete from app.audit_log`).rejects.toThrow(/ajout seul/);
    await expect(sql`truncate app.audit_log`).rejects.toThrow(/ajout seul/);
  });

  it("le rôle applicatif n'a ni UPDATE ni DELETE", async () => {
    await expect(asUser(sql, w.u.admin1, (tx) => tx`delete from app.audit_log`)).rejects.toThrow(/permission denied/);
  });

  it("on ne peut pas journaliser au nom d'un autre utilisateur", async () => {
    await expect(
      asUser(sql, w.u.client1, (tx) =>
        tx`insert into app.audit_log (actor_user_id, actor_kind, action, outcome) values (${w.u.admin1}, 'user', 'x', 'success')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("un dirigeant ne lit pas le journal ; l'admin lit celui de son cabinet", async () => {
    await sql`insert into app.audit_log (actor_kind, firm_id, company_id, action, outcome)
      values ('system', ${w.f1}, ${w.c.c1}, 'probe', 'success')`;
    expect(await asUser(sql, w.u.client1, (tx) => tx`select * from app.audit_log`)).toHaveLength(0);
    const adminRows = await asUser(sql, w.u.admin1, (tx) => tx`select * from app.audit_log where action = 'probe' and firm_id = ${w.f1}`);
    expect(adminRows).toHaveLength(1);
    const otherFirm = await asUser(sql, w.u.admin2, (tx) => tx`select * from app.audit_log where firm_id = ${w.f1}`);
    expect(otherFirm).toHaveLength(0);
  });
});

describe("Surface Supabase", () => {
  it("les rôles anon/authenticated de l'API Data n'ont aucun privilège sur le schéma app", async () => {
    const roles = await sql`select rolname from pg_roles where rolname in ('anon', 'authenticated')`;
    for (const { rolname } of roles) {
      const [r] = await sql`select has_schema_privilege(${rolname}, 'app', 'USAGE') as usage`;
      expect(r.usage).toBe(false);
    }
  });
});
