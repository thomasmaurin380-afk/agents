import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { getAuthSession } from "@/lib/auth/session";
import { getInvitation } from "@/services/invitations";
import { AcceptAsCurrentUser, NewAccountForm } from "./forms";

const STATUS_MESSAGES = {
  expired: "Cette invitation a expiré. Demandez un nouveau lien à votre DAF.",
  accepted: "Cette invitation a déjà été utilisée.",
  revoked: "Cette invitation a été annulée.",
} as const;

export default async function InvitationPage({ params }: PageProps<"/invitation/[token]">) {
  const { token } = await params;
  const invitation = await getInvitation(token);
  if (!invitation) {
    return <AuthCard title="Invitation introuvable" description="Le lien est invalide ou incomplet." />;
  }
  if (invitation.status !== "valid") {
    return <AuthCard title="Invitation non valide" description={STATUS_MESSAGES[invitation.status]} />;
  }
  const target = invitation.companyName ?? invitation.firmName;
  const description = (
    <>
      {invitation.firmName} vous invite à rejoindre <strong>{target}</strong> en tant que{" "}
      <strong>{ROLE_LABELS[invitation.role]}</strong>.
    </>
  );
  const session = await getAuthSession();
  if (session) {
    if (session.email !== invitation.email) {
      return (
        <AuthCard
          title="Invitation"
          description="Vous êtes connecté avec une autre adresse que celle invitée. Déconnectez-vous pour continuer."
        />
      );
    }
    return (
      <AuthCard title="Invitation" description={description}>
        <AcceptAsCurrentUser token={token} />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Invitation" description={description}>
      <NewAccountForm token={token} email={invitation.email} />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href="/login" className={buttonVariants({ variant: "link", size: "sm" })}>
          Se connecter
        </Link>
      </p>
    </AuthCard>
  );
}
