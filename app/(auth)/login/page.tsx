import type { Metadata } from "next";
import { AuthCard } from "@/components/layout/auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <AuthCard title="Connexion" description="Accédez à votre espace DAF ou à votre portail dirigeant.">
      <LoginForm />
    </AuthCard>
  );
}
