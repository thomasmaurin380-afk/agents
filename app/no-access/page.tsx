import { signOutAction } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/layout/auth-card";
import { Button } from "@/components/ui/button";

export default function NoAccessPage() {
  return (
    <AuthCard
      title="Aucun accès"
      description="Votre compte n'est rattaché à aucun cabinet ni à aucune entreprise. Contactez votre DAF."
    >
      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="w-full">
          Se déconnecter
        </Button>
      </form>
    </AuthCard>
  );
}
