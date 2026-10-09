import { redirect } from "next/navigation";
import { AuthCard } from "@/components/layout/auth-card";
import { getAuthSession } from "@/lib/auth/session";
import { TotpEnrollment } from "./enroll";

export default async function MfaSetupPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.hasVerifiedTotp) redirect("/mfa/verify");
  return (
    <AuthCard
      title="Double authentification"
      description="Obligatoire pour accéder au cockpit DAF : les données de vos clients sont confidentielles."
    >
      <TotpEnrollment />
    </AuthCard>
  );
}
