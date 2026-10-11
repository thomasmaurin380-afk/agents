import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";
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
    { label: "Sans données importées", value: withoutData, hint: "Aucun import comptable ou bancaire enregistré" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Cabinet"
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
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} hint={s.hint} />)}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Entreprises</CardTitle>
          <CardDescription>
            Les indicateurs de suivi (trésorerie, alertes, reportings) s&apos;ajouteront à cette vue au fil
            des prochaines phases. Aucun indicateur n&apos;est affiché sans données sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2 sm:px-0">
          {companies.length === 0 ? (
            <EmptyState className="mx-5 mb-4 sm:mx-6" icon={Building2} title="Aucune entreprise pour le moment">
              {isAdmin ? "Créez la première fiche entreprise pour commencer l'accompagnement." : "Aucune entreprise ne vous est encore affectée."}
            </EmptyState>
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
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold text-muted-foreground">
                          {(c.tradeName ?? c.legalName).slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/daf/c/${c.id}`} className="font-medium text-foreground hover:text-primary hover:underline underline-offset-4">
                            {c.tradeName ?? c.legalName}
                          </Link>
                          {c.tradeName ? <p className="truncate text-xs text-muted-foreground">{c.legalName}</p> : null}
                        </div>
                      </div>
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
