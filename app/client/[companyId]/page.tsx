import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IndicatorGrid } from "@/features/companies/indicator-grid";
import { orNotFound, requireActor } from "@/lib/guards";
import { getClientCompany } from "@/services/companies";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function ClientHomePage({ params }: PageProps<"/client/[companyId]">) {
  const { companyId } = await params;
  const actor = await requireActor();
  const view = await orNotFound(getClientCompany(actor, companyId));
  const c = view.company;
  return (
    <>
      <PageHeader
        title={c.tradeName ?? c.legalName}
        description="Votre situation financière, expliquée simplement."
      />
      {view.preview ? (
        <Alert variant="warning" className="mb-6">
          Aperçu du portail tel que le voit le dirigeant (mêmes données, mêmes règles de visibilité).
        </Alert>
      ) : null}
      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Vos indicateurs
        </h2>
        <IndicatorGrid available={new Set()} />
        <p className="text-xs text-muted-foreground">
          Les indicateurs s&apos;afficheront dès que vos données comptables et bancaires auront été
          transmises et contrôlées par votre DAF. Aucun chiffre n&apos;est estimé en l&apos;absence de données.
        </p>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Votre DAF</CardTitle>
            <CardDescription>Votre interlocuteur pour toute question financière.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {view.leadAdvisorName ? (
              <>
                <p className="font-medium" data-testid="lead-advisor">{view.leadAdvisorName}</p>
                <p className="text-muted-foreground">{view.leadAdvisorEmail}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Référent en cours de désignation.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recommandations et actions</CardTitle>
            <CardDescription>Les recommandations publiées par votre DAF apparaîtront ici.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Aucune recommandation publiée.</CardContent>
        </Card>
      </div>
    </>
  );
}
