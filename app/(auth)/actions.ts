"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signInWithPassword, signOut } from "@/lib/auth/operations";
import { withUser } from "@/lib/db/tenant";
import { formValues, type FormState } from "@/lib/form-state";
import { insertAudit } from "@/repositories/audit";
import { getActor } from "@/services/actor";

const loginSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(256),
});

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, message: "Identifiants incorrects.", values: formValues(formData) };
  const result = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    await withUser(null, (tx) =>
      insertAudit(tx, { actorUserId: null, actorKind: "system", action: "auth.login", outcome: "failure" }),
    );
    // Message volontairement générique (pas d'énumération des comptes).
    return { ok: false, message: "Identifiants incorrects.", values: formValues(formData) };
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const actor = await getActor();
  if (actor) {
    await withUser(actor.userId, (tx) =>
      insertAudit(tx, { actorUserId: actor.userId, actorKind: "user", action: "auth.logout", outcome: "success" }),
    );
  }
  await signOut();
  redirect("/login");
}
