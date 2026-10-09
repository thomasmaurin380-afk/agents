import "server-only";
import { z } from "zod";
import { adminCreateUser, adminDeleteUser, signInWithPassword } from "@/lib/auth/operations";
import { getAuthSession } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db/errors";
import { withUser } from "@/lib/db/tenant";
import { serverEnv } from "@/lib/env";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import { generateToken, hashToken } from "@/lib/tokens";
import { insertAudit } from "@/repositories/audit";
import {
  acceptInvitation as acceptInvitationRow,
  insertInvitation,
  previewInvitation,
  revokeInvitation as revokeInvitationRow,
  type InvitationPreview,
} from "@/repositories/invitations";
import { getProfile } from "@/repositories/memberships";
import { adminFirmIds, staffMfaSatisfied, type Actor } from "./actor";
import { authorizeCompany, recordDenied } from "./authorize";

const INVITATION_TTL_DAYS = 7;

export const passwordSchema = z
  .string()
  .min(12, "12 caractères minimum")
  .max(128)
  .regex(/[a-z]/, "Au moins une minuscule")
  .regex(/[A-Z]/, "Au moins une majuscule")
  .regex(/\d/, "Au moins un chiffre");

const emailSchema = z.email("Adresse e-mail invalide").transform((v) => v.trim().toLowerCase());

const clientInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["client_owner", "client_member", "client_readonly"]),
});

const staffInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["firm_admin", "firm_analyst"]),
});

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of error.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

function invitationUrl(token: string): string {
  return new URL(`/invitation/${token}`, serverEnv().APP_URL).toString();
}

function expiry(): Date {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000);
}

/** Invite un utilisateur client sur une entreprise. Le lien n'est renvoyé qu'une seule fois. */
export async function inviteClient(actor: Actor, companyId: string, raw: unknown) {
  const parsed = clientInvitationSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Formulaire invalide", fieldErrors(parsed.error));
  const token = generateToken();
  await withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "client_members", "create");
    const row = await insertInvitation(tx, {
      firmId: access.company.firmId,
      companyId,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: hashToken(token),
      expiresAt: expiry(),
      createdBy: actor.userId,
    });
    await insertAudit(tx, {
      actorUserId: actor.userId,
      actorKind: "user",
      firmId: access.company.firmId,
      companyId,
      action: "invitation.create",
      objectType: "invitation",
      objectId: row.id,
      outcome: "success",
      details: { role: parsed.data.role },
    });
  });
  return { url: invitationUrl(token), expiresInDays: INVITATION_TTL_DAYS };
}

/** Invite un collaborateur du cabinet (réservé à l'administrateur DAF). */
export async function inviteStaff(actor: Actor, raw: unknown) {
  const firms = adminFirmIds(actor);
  if (firms.length === 0 || !staffMfaSatisfied(actor)) {
    await recordDenied(actor, { action: "invitation.create_staff", reason: "firm_admin_only" });
    throw new AccessDeniedError("firm_admin_only");
  }
  const parsed = staffInvitationSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Formulaire invalide", fieldErrors(parsed.error));
  const token = generateToken();
  await withUser(actor.userId, async (tx) => {
    const row = await insertInvitation(tx, {
      firmId: firms[0],
      companyId: null,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: hashToken(token),
      expiresAt: expiry(),
      createdBy: actor.userId,
    });
    await insertAudit(tx, {
      actorUserId: actor.userId,
      actorKind: "user",
      firmId: firms[0],
      action: "invitation.create_staff",
      objectType: "invitation",
      objectId: row.id,
      outcome: "success",
      details: { role: parsed.data.role },
    });
  });
  return { url: invitationUrl(token), expiresInDays: INVITATION_TTL_DAYS };
}

export async function revokeInvitation(actor: Actor, companyId: string, invitationId: string) {
  if (!z.uuid().safeParse(invitationId).success) throw new ValidationError("Invitation invalide");
  await withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "client_members", "admin");
    const row = await revokeInvitationRow(tx, invitationId);
    if (!row || row.companyId !== companyId) throw new BusinessRuleError("not_found", "Invitation introuvable");
    await insertAudit(tx, {
      actorUserId: actor.userId,
      actorKind: "user",
      firmId: access.company.firmId,
      companyId,
      action: "invitation.revoke",
      objectType: "invitation",
      objectId: invitationId,
      outcome: "success",
    });
  });
}

export async function getInvitation(token: string): Promise<InvitationPreview | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return withUser(null, (tx) => previewInvitation(tx, hashToken(token)));
}

const newAccountSchema = z.object({
  fullName: z.string().trim().min(2, "Nom obligatoire").max(120),
  password: passwordSchema,
});

/**
 * Acceptation par un nouvel utilisateur : création du compte d'authentification, puis
 * rattachement atomique en base. En cas d'échec du rattachement, le compte créé est supprimé.
 */
export async function acceptInvitationWithNewAccount(token: string, raw: unknown) {
  const parsed = newAccountSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Formulaire invalide", fieldErrors(parsed.error));
  const preview = await getInvitation(token);
  if (!preview || preview.status !== "valid") {
    throw new BusinessRuleError("invitation_not_valid", "Cette invitation n'est plus valide.");
  }
  const created = await adminCreateUser(preview.email, parsed.data.password);
  if (!created.ok) {
    if (created.reason === "email_exists" || created.reason === "user_already_exists") {
      throw new BusinessRuleError(
        "account_exists",
        "Un compte existe déjà pour cette adresse : connectez-vous, puis rouvrez le lien d'invitation.",
      );
    }
    if (created.reason === "weak_password") {
      throw new ValidationError("Formulaire invalide", { password: ["Mot de passe trop faible"] });
    }
    throw new BusinessRuleError("account_creation_failed", "La création du compte a échoué.");
  }
  try {
    await withUser(created.userId, (tx) =>
      acceptInvitationRow(tx, {
        tokenHash: hashToken(token),
        userId: created.userId,
        email: preview.email,
        fullName: parsed.data.fullName,
      }),
    );
  } catch (e) {
    await adminDeleteUser(created.userId);
    if (isUniqueViolation(e, "users_email_key")) {
      throw new BusinessRuleError(
        "profile_exists",
        "Un profil existe déjà pour cette adresse. Contactez votre DAF pour rétablir votre accès.",
      );
    }
    throw e;
  }
  await signInWithPassword(preview.email, parsed.data.password);
  return { role: preview.role };
}

/** Acceptation par un utilisateur déjà connecté (même adresse e-mail). */
export async function acceptInvitationAsCurrentUser(token: string, fullNameIfNew?: string) {
  const session = await getAuthSession();
  if (!session) throw new BusinessRuleError("not_authenticated", "Connectez-vous d'abord.");
  const preview = await getInvitation(token);
  if (!preview || preview.status !== "valid") {
    throw new BusinessRuleError("invitation_not_valid", "Cette invitation n'est plus valide.");
  }
  if (preview.email !== session.email) {
    throw new BusinessRuleError(
      "invitation_email_mismatch",
      "Cette invitation est destinée à une autre adresse e-mail.",
    );
  }
  await withUser(session.userId, async (tx) => {
    const profile = await getProfile(tx, session.userId);
    await acceptInvitationRow(tx, {
      tokenHash: hashToken(token),
      userId: session.userId,
      email: session.email,
      fullName: profile?.fullName ?? fullNameIfNew?.trim() ?? session.email,
    });
  });
  return { role: preview.role };
}
