import { redirect } from "next/navigation";
import { AuthCard } from "@/components/layout/auth-card";
import { getAuthSession } from "@/lib/auth/session";
import { VerifyForm } from "./verify-form";

export default async function MfaVerifyPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.hasVerifiedTotp) redirect("/mfa/setup");
  if (session.aal === "aal2") redirect("/");
  return (
    <AuthCard title="Vérification en deux étapes">
      <VerifyForm />
    </AuthCard>
  );
}
