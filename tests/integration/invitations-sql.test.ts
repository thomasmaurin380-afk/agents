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

async function invite(opts: { role?: string; email?: string; expiresIn?: string; companyId?: string | null } = {}) {
  const hash = `hash-${randomUUID()}`;
  const email = opts.email ?? `new.${randomUUID().slice(0, 6)}@test.invalid`;
  await asUser(sql, w.u.admin1, (tx) => tx`
    insert into app.invitations (firm_id, company_id, email, role, token_hash, expires_at, created_by)
    values (${w.f1}, ${opts.companyId === undefined ? w.c.c1 : opts.companyId}, ${email},
            ${opts.role ?? "client_member"}, ${hash}, now() + ${opts.expiresIn ?? "7 days"}::interval, ${w.u.admin1})`);
  return { hash, email };
}

const accept = (userId: string, hash: string, email: string) =>
  asUser(sql, userId, (tx) => tx`select * from app.accept_invitation(${hash}, ${userId}::uuid, ${email}, 'Nouvel utilisateur')`);

describe("Invitations (fonctions SQL)", () => {
  it("un collaborateur DAF ne peut pas créer d'invitation", async () => {
    await expect(
      asUser(sql, w.u.analyst1, (tx) => tx`
        insert into app.invitations (firm_id, company_id, email, role, token_hash, expires_at, created_by)
        values (${w.f1}, ${w.c.c1}, 'a@test.invalid', 'client_member', 'h', now() + interval '1 day', ${w.u.analyst1})`),
    ).rejects.toThrow(/row-level security/);
  });

  it("un admin ne peut pas inviter sur l'entreprise d'un autre cabinet", async () => {
    await expect(
      asUser(sql, w.u.admin1, (tx) => tx`
        insert into app.invitations (firm_id, company_id, email, role, token_hash, expires_at, created_by)
        values (${w.f1}, ${w.c.c3}, 'a@test.invalid', 'client_member', 'h2', now() + interval '1 day', ${w.u.admin1})`),
    ).rejects.toThrow(/row-level security/);
  });

  it("l'aperçu ne révèle que l'essentiel, et rien pour un jeton inconnu", async () => {
    const { hash, email } = await invite();
    const [p] = await asUser(sql, null, (tx) => tx`select * from app.invitation_preview(${hash})`);
    expect(p).toMatchObject({ email, role: "client_member", company_name: "Entreprise C1", status: "valid" });
    expect(await asUser(sql, null, (tx) => tx`select * from app.invitation_preview('inconnu')`)).toHaveLength(0);
  });

  it("acceptation : crée le profil et l'accès, puis le jeton est consommé", async () => {
    const { hash, email } = await invite();
    const newUser = randomUUID();
    const [r] = await accept(newUser, hash, email);
    expect(r).toMatchObject({ role: "client_member", company_id: w.c.c1 });
    const companies = await asUser(sql, newUser, (tx) => tx`select id from app.companies`);
    expect(companies.map((c) => c.id)).toEqual([w.c.c1]);
    await expect(accept(newUser, hash, email)).rejects.toThrow(/invitation_not_valid/);
    const audit = await sql`select * from app.audit_log where action = 'invitation.accept' and actor_user_id = ${newUser}`;
    expect(audit).toHaveLength(1);
  });

  it("refuse : utilisateur différent de l'utilisateur courant, e-mail différent, jeton expiré ou révoqué", async () => {
    const a = await invite();
    const someone = randomUUID();
    await expect(
      asUser(sql, w.u.client1, (tx) => tx`select * from app.accept_invitation(${a.hash}, ${someone}::uuid, ${a.email}, 'x')`),
    ).rejects.toThrow(/invitation_user_mismatch/);
    await expect(accept(someone, a.hash, "autre@test.invalid")).rejects.toThrow(/invitation_email_mismatch/);

    const expired = await invite({ expiresIn: "-1 minute" });
    await expect(accept(randomUUID(), expired.hash, expired.email)).rejects.toThrow(/invitation_not_valid/);

    const revoked = await invite();
    await asUser(sql, w.u.admin1, (tx) => tx`update app.invitations set revoked_at = now() where token_hash = ${revoked.hash}`);
    await expect(accept(randomUUID(), revoked.hash, revoked.email)).rejects.toThrow(/invitation_not_valid/);
  });

  it("une invitation collaborateur DAF rattache au cabinet, sans entreprise", async () => {
    const { hash, email } = await invite({ role: "firm_analyst", companyId: null });
    const newUser = randomUUID();
    await accept(newUser, hash, email);
    const [fm] = await sql`select role from app.firm_members where user_id = ${newUser}`;
    expect(fm.role).toBe("firm_analyst");
    // Non affecté : aucune entreprise visible.
    expect(await asUser(sql, newUser, (tx) => tx`select id from app.companies`)).toHaveLength(0);
  });

  it("la contrainte de portée interdit une invitation client sans entreprise", async () => {
    await expect(invite({ role: "client_owner", companyId: null })).rejects.toThrow(/invitations_scope/);
  });
});
