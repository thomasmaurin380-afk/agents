// Barrières n° 1 et 2 (services + repositories) avec le vrai code applicatif.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessDeniedError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/services/actor";
import { createWorld, ownerSql, type World } from "./fixtures";

const sql = ownerSql();
let w: World;
let services: typeof import("@/services/companies");
let invitations: typeof import("@/services/invitations");

beforeAll(async () => {
  w = await createWorld(sql);
  services = await import("@/services/companies");
  invitations = await import("@/services/invitations");
});
afterAll(async () => {
  await sql.end();
});

function staff(userId: string, firmId: string, role: "firm_admin" | "firm_analyst", aal: "aal1" | "aal2" = "aal2"): Actor {
  return { userId, email: "x@test.invalid", fullName: "x", aal, hasVerifiedTotp: true, firms: [{ firmId, role, firmName: "C" }], clientCompanies: [] };
}
function client(userId: string, companyId: string): Actor {
  return {
    userId, email: "y@test.invalid", fullName: "y", aal: "aal1", hasVerifiedTotp: false, firms: [],
    clientCompanies: [{ companyId, role: "client_owner", companyName: "C", tradeName: null }],
  };
}

const deniedCount = async (userId: string) =>
  Number((await sql`select count(*) from app.audit_log where actor_user_id = ${userId} and outcome = 'denied'`)[0].count);

describe("Services — isolation et droits", () => {
  it("un dirigeant accède à son entreprise, pas à une autre (refus journalisé)", async () => {
    const own = await services.getClientCompany(client(w.u.client1, w.c.c1), w.c.c1);
    expect(own.company.id).toBe(w.c.c1);
    expect(own.preview).toBe(false);
    const before = await deniedCount(w.u.client1);
    await expect(services.getClientCompany(client(w.u.client1, w.c.c1), w.c.c2)).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await deniedCount(w.u.client1)).toBe(before + 1);
  });

  it("se déclarer client d'une autre entreprise dans l'Actor ne contourne pas la base", async () => {
    // Acteur forgé : prétend être client de C2. La RLS ne le laisse pas lire C2.
    await expect(services.getClientCompany(client(w.u.client1, w.c.c2), w.c.c2)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("un identifiant d'entreprise invalide est refusé proprement", async () => {
    await expect(services.getClientCompany(client(w.u.client1, w.c.c1), "pas-un-uuid")).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("un dirigeant n'accède pas à l'espace DAF de son entreprise", async () => {
    await expect(services.getCompanyWorkspace(client(w.u.client1, w.c.c1), w.c.c1)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("le portefeuille d'un collaborateur ne contient que ses entreprises affectées", async () => {
    const rows = await services.listPortfolio(staff(w.u.analyst1, w.f1, "firm_analyst"));
    expect(rows.map((r) => r.id)).toEqual([w.c.c1]);
  });

  it("le portefeuille de l'admin couvre son cabinet uniquement", async () => {
    const rows = await services.listPortfolio(staff(w.u.admin1, w.f1, "firm_admin"));
    expect(rows.map((r) => r.id).sort()).toEqual([w.c.c1, w.c.c2].sort());
  });

  it("sans second facteur (aal1), le personnel DAF est refusé", async () => {
    await expect(services.listPortfolio(staff(w.u.admin1, w.f1, "firm_admin", "aal1"))).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(services.getCompanyWorkspace(staff(w.u.admin1, w.f1, "firm_admin", "aal1"), w.c.c1)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("un dirigeant ne voit pas le portefeuille", async () => {
    await expect(services.listPortfolio(client(w.u.client1, w.c.c1))).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe("Services — création et modification d'entreprise", () => {
  it("l'admin crée une entreprise, avec audit et affectation du référent", async () => {
    const admin = staff(w.u.admin1, w.f1, "firm_admin");
    const { id } = await services.createCompany(admin, {
      legalName: "Nouvelle Société", siren: "732 829 320", fiscalYearStartMonth: "7", leadAdvisorId: w.u.analyst1,
      tradeName: "", legalForm: "SAS", nafCode: "62.02a", sector: "",
    });
    const [row] = await sql`select * from app.companies where id = ${id}`;
    expect(row).toMatchObject({ firm_id: w.f1, siren: "732829320", naf_code: "62.02A", fiscal_year_start_month: 7, trade_name: null, currency: "EUR" });
    const adv = await sql`select * from app.company_advisors where company_id = ${id} and user_id = ${w.u.analyst1}`;
    expect(adv).toHaveLength(1);
    const audit = await sql`select * from app.audit_log where action = 'company.create' and object_id = ${id}`;
    expect(audit).toHaveLength(1);
    // Le collaborateur affecté la voit désormais dans son portefeuille.
    const rows = await services.listPortfolio(staff(w.u.analyst1, w.f1, "firm_analyst"));
    expect(rows.map((r) => r.id)).toContain(id);
  });

  it("validation : SIREN invalide, NAF invalide, raison sociale vide", async () => {
    const admin = staff(w.u.admin1, w.f1, "firm_admin");
    const err = await services
      .createCompany(admin, { legalName: " ", siren: "123456789", nafCode: "XX", fiscalYearStartMonth: "1" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys((err as ValidationError).fieldErrors).sort()).toEqual(["legalName", "nafCode", "siren"]);
  });

  it("SIREN en double dans le cabinet : erreur explicite", async () => {
    const admin = staff(w.u.admin1, w.f1, "firm_admin");
    const input = { legalName: "Doublon", siren: "552100554", fiscalYearStartMonth: "1" };
    await services.createCompany(admin, input);
    const err = await services.createCompany(admin, input).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors.siren?.[0]).toMatch(/existe déjà/);
  });

  it("un collaborateur ne peut ni créer ni modifier une entreprise", async () => {
    const analyst = staff(w.u.analyst1, w.f1, "firm_analyst");
    await expect(services.createCompany(analyst, { legalName: "X", fiscalYearStartMonth: "1" })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      services.updateCompany(analyst, w.c.c1, { legalName: "X", fiscalYearStartMonth: "1", status: "active" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("un admin d'un autre cabinet ne peut pas modifier l'entreprise", async () => {
    await expect(
      services.updateCompany(staff(w.u.admin2, w.f2, "firm_admin"), w.c.c1, { legalName: "X", fiscalYearStartMonth: "1", status: "active" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe("Services — invitations", () => {
  it("l'admin invite un dirigeant ; le lien contient un jeton dont seul le hash est stocké", async () => {
    const { url } = await invitations.inviteClient(staff(w.u.admin1, w.f1, "firm_admin"), w.c.c1, {
      email: "Futur.Dirigeant@Test.invalid", role: "client_owner",
    });
    const token = url.split("/invitation/")[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await sql`select * from app.invitations where email = 'futur.dirigeant@test.invalid'`;
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored[0])).not.toContain(token);
    const preview = await invitations.getInvitation(token);
    expect(preview).toMatchObject({ status: "valid", role: "client_owner", companyName: "Entreprise C1" });
  });

  it("un collaborateur ou un client ne peut pas inviter", async () => {
    await expect(
      invitations.inviteClient(staff(w.u.analyst1, w.f1, "firm_analyst"), w.c.c1, { email: "a@test.invalid", role: "client_owner" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      invitations.inviteClient(client(w.u.client1, w.c.c1), w.c.c1, { email: "a@test.invalid", role: "client_owner" }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("un jeton malformé ou inconnu ne renvoie rien", async () => {
    expect(await invitations.getInvitation("court")).toBeNull();
    expect(await invitations.getInvitation("a".repeat(43))).toBeNull();
  });

  it("révocation : l'invitation n'est plus valide", async () => {
    const admin = staff(w.u.admin1, w.f1, "firm_admin");
    const { url } = await invitations.inviteClient(admin, w.c.c1, { email: "revoque@test.invalid", role: "client_member" });
    const [inv] = await sql`select id from app.invitations where email = 'revoque@test.invalid'`;
    await invitations.revokeInvitation(admin, w.c.c1, inv.id);
    expect((await invitations.getInvitation(url.split("/invitation/")[1]))?.status).toBe("revoked");
  });
});
