import "server-only";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase-server";

export type AuthResult = { ok: true } | { ok: false; reason: string };

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, reason: error.code ?? "auth_error" } : { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

/** Démarre l'enrôlement TOTP : supprime les facteurs non vérifiés puis en crée un nouveau. */
export async function startTotpEnrollment(): Promise<
  { ok: true; factorId: string; qrCodeSvg: string; secret: string } | { ok: false; reason: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Application d'authentification ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { ok: false, reason: error?.code ?? "mfa_enroll_error" };
  return { ok: true, factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret };
}

/** Vérifie un code TOTP pour un facteur donné (ou le premier facteur vérifié) ; passe la session en aal2. */
export async function verifyTotp(code: string, factorId?: string): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  let id = factorId;
  if (!id) {
    const { data } = await supabase.auth.mfa.listFactors();
    id = data?.totp.find((f) => f.status === "verified")?.id;
  }
  if (!id) return { ok: false, reason: "mfa_no_factor" };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
  return error ? { ok: false, reason: error.code ?? "mfa_verify_error" } : { ok: true };
}

/** Crée un compte confirmé (acceptation d'invitation, seed). */
export async function adminCreateUser(
  email: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) return { ok: false, reason: error?.code ?? "create_user_error" };
  return { ok: true, userId: data.user.id };
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.auth.admin.deleteUser(userId);
}
