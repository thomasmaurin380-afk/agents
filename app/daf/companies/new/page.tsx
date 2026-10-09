import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { createCompanyAction } from "@/features/companies/actions";
import { CompanyForm } from "@/features/companies/company-form";
import { orNotFound, requireStaff } from "@/lib/guards";
import { listAssignableStaff } from "@/services/companies";

export const metadata: Metadata = { title: "Nouvelle entreprise" };

export default async function NewCompanyPage() {
  const actor = await requireStaff();
  const staff = await orNotFound(listAssignableStaff(actor));
  return (
    <>
      <PageHeader
        title="Nouvelle entreprise cliente"
        description="Étape 1 du parcours : créer le dossier. Exercices et plan de comptes seront complétés lors de l'import (phase 2)."
      />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <CompanyForm action={createCompanyAction} staff={staff} submitLabel="Créer l'entreprise" />
        </CardContent>
      </Card>
    </>
  );
}
