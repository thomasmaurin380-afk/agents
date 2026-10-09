import { describe, expect, it } from "vitest";
import { ACTIONS, can, COMPANY_ROLES, NEVER_CLIENT, RESOURCES } from "@/domain/permissions/matrix";

const CLIENT_ROLES = COMPANY_ROLES.filter((r) => r.startsWith("client_"));

describe("Matrice des permissions", () => {
  it("aucun rôle client n'accède aux notes, documents internes, audit, règles SIG, invitations", () => {
    for (const role of CLIENT_ROLES) {
      for (const resource of NEVER_CLIENT) {
        for (const action of ACTIONS) expect(can(role, resource, action), `${role} ${resource} ${action}`).toBe(false);
      }
    }
  });

  it("aucun rôle client ne valide ni ne publie quoi que ce soit", () => {
    for (const role of CLIENT_ROLES) {
      for (const resource of RESOURCES) {
        expect(can(role, resource, "validate")).toBe(false);
        expect(can(role, resource, "publish")).toBe(false);
        expect(can(role, resource, "admin")).toBe(false);
      }
    }
  });

  it("le dirigeant et le collaborateur client génèrent un rapport instantané ; la lecture seule non", () => {
    expect(can("client_owner", "instant_report", "create")).toBe(true);
    expect(can("client_member", "instant_report", "create")).toBe(true);
    expect(can("client_readonly", "instant_report", "create")).toBe(false);
    expect(can("client_readonly", "validated_report", "export")).toBe(false);
  });

  it("seul l'administrateur DAF publie un rapport validé et gère les accès", () => {
    expect(can("firm_admin", "validated_report", "publish")).toBe(true);
    expect(can("firm_analyst", "validated_report", "publish")).toBe(false);
    expect(can("firm_admin", "client_members", "create")).toBe(true);
    expect(can("firm_analyst", "client_members", "create")).toBe(false);
    expect(can("firm_analyst", "company", "update")).toBe(false);
  });
});
