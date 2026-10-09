import "server-only";
import { cache } from "react";
import { getAuthSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db/tenant";
import { serverEnv } from "@/lib/env";
import { clientMembershipsOf, firmMembershipsOf, getProfile } from "@/repositories/memberships";

export type Actor = {
  userId: string;
  email: string;
  fullName: string;
  aal: "aal1" | "aal2";
  hasVerifiedTotp: boolean;
  firms: { firmId: string; role: "firm_admin" | "firm_analyst"; firmName: string }[];
  clientCompanies: {
    companyId: string;
    role: "client_owner" | "client_member" | "client_readonly";
    companyName: string;
    tradeName: string | null;
  }[];
};

/**
 * Utilisateur courant et ses appartenances, lus en base à chaque requête (les rôles ne sont
 * jamais lus depuis le jeton). `null` si non connecté, sans profil applicatif ou désactivé.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getAuthSession();
  if (!session) return null;
  return withUser(session.userId, async (tx) => {
    const profile = await getProfile(tx, session.userId);
    if (!profile || profile.disabledAt) return null;
    const [firms, clientCompanies] = await Promise.all([
      firmMembershipsOf(tx, session.userId),
      clientMembershipsOf(tx, session.userId),
    ]);
    return {
      userId: session.userId,
      email: profile.email,
      fullName: profile.fullName,
      aal: session.aal,
      hasVerifiedTotp: session.hasVerifiedTotp,
      firms,
      clientCompanies,
    };
  });
});

export function isStaff(actor: Actor): boolean {
  return actor.firms.length > 0;
}

/** Le second facteur est-il satisfait pour un usage « cabinet » ? (D-15) */
export function staffMfaSatisfied(actor: Actor): boolean {
  return !serverEnv().REQUIRE_STAFF_MFA || actor.aal === "aal2";
}

export function adminFirmIds(actor: Actor): string[] {
  return actor.firms.filter((f) => f.role === "firm_admin").map((f) => f.firmId);
}
