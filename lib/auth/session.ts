import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "./supabase-server";

export type AuthSession = {
  userId: string;
  email: string;
  /** Niveau d'assurance : aal2 = second facteur vérifié dans cette session. */
  aal: "aal1" | "aal2";
  hasVerifiedTotp: boolean;
};

/**
 * Session authentifiée de la requête courante, revalidée auprès du serveur d'authentification
 * (jamais déduite du seul cookie). Mémoïsée pour la durée de la requête.
 */
export const getAuthSession = cache(async (): Promise<AuthSession | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  const [{ data: aalData }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  return {
    userId: data.user.id,
    email: data.user.email.toLowerCase(),
    aal: aalData?.currentLevel === "aal2" ? "aal2" : "aal1",
    hasVerifiedTotp: (factors?.totp ?? []).some((f) => f.status === "verified"),
  };
});
