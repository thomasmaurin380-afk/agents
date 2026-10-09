import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { UploadForm } from "@/features/data/forms";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getDataOverview } from "@/services/imports";

export const metadata: Metadata = { title: "Nouvel import" };

export default async function NewImportPage({ params, searchParams }: PageProps<"/daf/c/[companyId]/imports/new">) {
  const { companyId } = await params;
  const { kind } = await searchParams;
  const actor = await requireStaff();
  const d = await orNotFound(getDataOverview(actor, companyId));
  return (
    <>
      <PageHeader title="Nouvel import" description="Étape 1 : téléverser le fichier. Il sera analysé et contrôlé avant tout enregistrement." />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <UploadForm
            companyId={companyId}
            defaultKind={typeof kind === "string" ? kind : "trial_balance"}
            fiscalYears={d.fiscalYears.map((f) => ({ id: f.id, label: f.label, endDate: f.endDate }))}
            bankAccounts={d.bankAccounts.map((b) => ({ id: b.id, label: `${b.label} — ${b.bankName}` }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
