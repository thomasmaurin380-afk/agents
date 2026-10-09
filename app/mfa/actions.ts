"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { startTotpEnrollment, verifyTotp } from "@/lib/auth/operations";
import { getAuthSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db/tenant";
import type { FormState } from "@/lib/form-state";
import { insertAudit } from "@/repositories/audit";

const codeSchema = z.string().trim().regex(/^\d{6}$/, "Code à 6 chiffres");

export async function startEnrollmentAction(): Promise<
  FormState<{ factorId: string; qrCodeSvg: string; secret: string }>
> {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const r = await startTotpEnrollment();
  if (!r.ok) return { ok: false, message: "Impossible de démarrer l'enrôlement. Réessayez." };
  return { ok: true, data: { factorId: r.factorId, qrCodeSvg: r.qrCodeSvg, secret: r.secret } };
}

async function audit(userId: string, action: string, outcome: "success" | "failure") {
  await withUser(userId, (tx) => insertAudit(tx, { actorUserId: userId, actorKind: "user", action, outcome }));
}

export async function verifyEnrollmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const code = codeSchema.safeParse(formData.get("code"));
  const factorId = z.uuid().safeParse(formData.get("factorId"));
  if (!code.success || !factorId.success) return { ok: false, message: "Code à 6 chiffres attendu." };
  const r = await verifyTotp(code.data, factorId.data);
  await audit(session.userId, "auth.mfa_enroll", r.ok ? "success" : "failure");
  if (!r.ok) return { ok: false, message: "Code incorrect ou expiré." };
  redirect("/");
}

export async function verifyMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { ok: false, message: "Code à 6 chiffres attendu." };
  const r = await verifyTotp(code.data);
  await audit(session.userId, "auth.mfa_verify", r.ok ? "success" : "failure");
  if (!r.ok) return { ok: false, message: "Code incorrect ou expiré." };
  redirect("/");
}
