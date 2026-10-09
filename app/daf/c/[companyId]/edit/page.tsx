import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { updateCompanyAction } from "@/features/companies/actions";
import { CompanyForm } from "@/features/companies/company-form";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getCompanyWorkspace } from "@/services/companies";

export const metadata: Metadata = { title: "Modifier l'entreprise" };

export default async function EditCompanyPage({ params }: PageProps<"/daf/c/[companyId]/edit">) {
  const { companyId } = await params;
  const actor = await requireStaff();
  const ws = await orNotFound(getCompanyWorkspace(actor, companyId));
  if (ws.role !== "firm_admin") notFound();
  const c = ws.company;
  return (
    <>
      <PageHeader title={`Modifier — ${c.legalName}`} />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <CompanyForm
            action={updateCompanyAction.bind(null, c.id)}
            staff={ws.staff.filter((s) => s.role === "firm_analyst" || s.role === "firm_admin")}
            defaults={c}
            withStatus
            submitLabel="Enregistrer"
          />
        </CardContent>
      </Card>
    </>
  );
}
