import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPANY_STATUS_LABELS, COMPANY_STATUS_VARIANTS } from "@/features/companies/labels";
import { requireStaff } from "@/lib/guards";
import { adminFirmIds } from "@/services/actor";
import { listPortfolio } from "@/services/companies";

export const metadata: Metadata = { title: "Portefeuille clients" };

export default async function PortfolioPage() {
  const actor = await requireStaff();
  const companies = await listPortfolio(actor);
  const isAdmin = adminFirmIds(actor).length > 0;
  const count = (s: string) => companies.filter((c) => c.status === s).length;
  const withoutData = companies.filter((c) => c.dataVersion === 0 && c.status !== "archived").length;

  const stats = [
    { label: "Entreprises suivies", value: companies.filter((c) => c.status !== "archived").length },
    { label: "Actives", value: count("active") },
    { label: "En intégration", value: count("onboarding") },
    { label: "Sans données importées", value: withoutData, hint: "Imports disponibles en phase 2" },
  ];

  return (
    <>
      <PageHeader
        title="Portefeuille clients"
        description="Vue d'ensemble des entreprises que vous accompagnez."
        actions={
          isAdmin ? (
            <Link href="/daf/companies/new" className={buttonVariants()}>
              <Plus /> Nouvelle entreprise
            </Link>
          ) : null
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
            </CardHeader>
            {s.hint ? <CardContent className="text-xs text-muted-foreground">{s.hint}</CardContent> : null}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Entreprises</CardTitle>
          <CardDescription>
            Alertes, trésorerie et reportings apparaîtront ici dès que les données seront importées
            (phases 2 à 5). Aucun indicateur n&apos;est affiché sans données sources.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucune entreprise pour le moment.</p>
          ) : (
            <Table data-testid="portfolio-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Secteur</TableHead>
                  <TableHead>DAF référent</TableHead>
                  <TableHead>Données</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/daf/c/${c.id}`} className="font-medium hover:underline">
                        {c.tradeName ?? c.legalName}
                      </Link>
                      {c.tradeName ? <p className="text-xs text-muted-foreground">{c.legalName}</p> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.sector ?? "—"}</TableCell>
                    <TableCell>{c.leadAdvisorName ?? <span className="text-muted-foreground">Non attribué</span>}</TableCell>
                    <TableCell>
                      {c.dataVersion === 0 ? (
                        <Badge variant="outline">Aucune donnée importée</Badge>
                      ) : (
                        <Badge variant="secondary">Données importées</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={COMPANY_STATUS_VARIANTS[c.status]}>{COMPANY_STATUS_LABELS[c.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
