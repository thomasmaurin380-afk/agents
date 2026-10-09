import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { invitations } from "@/db/schema";
import type { RuntimeTx } from "@/lib/db/tenant";

export type InvitationRole = (typeof invitations.$inferSelect)["role"];

export async function insertInvitation(
  tx: RuntimeTx,
  data: {
    firmId: string;
    companyId: string | null;
    email: string;
    role: InvitationRole;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  },
) {
  const [row] = await tx.insert(invitations).values(data).returning({ id: invitations.id });
  return row;
}

export async function listOpenInvitations(tx: RuntimeTx, companyId: string) {
  return tx
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.companyId, companyId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

export async function revokeInvitation(tx: RuntimeTx, invitationId: string) {
  const rows = await tx
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id, firmId: invitations.firmId, companyId: invitations.companyId });
  return rows[0] ?? null;
}

export type InvitationPreview = {
  email: string;
  role: InvitationRole;
  companyName: string | null;
  firmName: string;
  status: "valid" | "expired" | "accepted" | "revoked";
};

export async function previewInvitation(
  tx: RuntimeTx,
  tokenHash: string,
): Promise<InvitationPreview | null> {
  const rows = await tx.execute<{
    email: string;
    role: InvitationRole;
    company_name: string | null;
    firm_name: string;
    status: InvitationPreview["status"];
  }>(sql`select * from app.invitation_preview(${tokenHash})`);
  const r = rows[0];
  return r
    ? { email: r.email, role: r.role, companyName: r.company_name, firmName: r.firm_name, status: r.status }
    : null;
}

export async function acceptInvitation(
  tx: RuntimeTx,
  args: { tokenHash: string; userId: string; email: string; fullName: string },
) {
  const rows = await tx.execute<{
    invitation_id: string;
    role: InvitationRole;
    firm_id: string;
    company_id: string | null;
  }>(
    sql`select * from app.accept_invitation(${args.tokenHash}, ${args.userId}::uuid, ${args.email}, ${args.fullName})`,
  );
  const r = rows[0];
  return { invitationId: r.invitation_id, role: r.role, firmId: r.firm_id, companyId: r.company_id };
}
