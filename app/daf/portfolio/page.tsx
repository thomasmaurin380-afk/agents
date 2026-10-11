import { ArrowUpRight, Building2, Database, Layers, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type * as React from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPANY_STATUS_LABELS, COMPANY_STATUS_VARIANTS } from "@/features/companies/labels";
import { requireStaff } from "@/lib/guards";
import { cn } from "@/lib/utils";
import { adminFirmIds } from "@/services/actor";
import { listPortfolio } from "@/services/companies";

export const metadata: Metadata = { title: "Portefeuille clients" };

const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/** Répartition du portefeuille : uniquement des comptages réels (aucune donnée financière). */
const SEGMENTS = [
  { status: "active", label: "Actives", className: "bg-primary" },
  { status: "onboarding", label: "En intégration", className: "bg-primary/35" },
  { status: "paused", label: "En pause", className: "bg-subtle-foreground/45" },
] as const;

type Company = Awaited<ReturnType<typeof listPortfolio>>[number];
const displayName = (c: Company) => c.tradeName ?? c.legalName;
/** Ligne secondaire : raison sociale si un nom commercial est utilisé, sinon secteur. */
const secondary = (c: Company) => (c.tradeName ? c.legalName : c.sector);
const monogram = (c: Company) =>
  displayName(c).replace(/\(.*?\)/g, "").replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export default async function PortfolioPage() {
  const actor = await requireStaff();
  const companies = await listPortfolio(actor);
  const isAdmin = adminFirmIds(actor).length > 0;
  const followed = companies.filter((c) => c.status !== "archived");
  const archived = companies.length - followed.length;
  const withData = followed.filter((c) => c.dataVersion > 0).length;
  const toComplete = followed.filter((c) => c.dataVersion === 0);
  const count = (s: string) => followed.filter((c) => c.status === s).length;
  const firstName = actor.fullName.split(/\s+/)[0];

  return (
    <>
      <PageHeader
        eyebrow={<>Bonjour {firstName} · {today.format(new Date())}</>}
        title="Portefeuille clients"
        description={`${actor.firms[0]?.firmName ?? "Cabinet"} · entreprises que vous accompagnez`}
        actions={
          isAdmin ? (
            <Link href="/daf/companies/new" className={buttonVariants()}>
              <Plus /> Nouvelle entreprise
            </Link>
          ) : null
        }
      />

      <div className="mb-6 grid gap-5 lg:grid-cols-12">
        {/* Point focal : taille et composition du portefeuille, en une bande compacte. */}
        <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:gap-8 lg:col-span-7" data-testid="portfolio-summary">
          <div className="flex shrink-0 flex-col justify-between gap-3 sm:border-r sm:pr-8">
            <p className="eyebrow">Entreprises suivies</p>
            <div>
              <p className="figure text-[60px]">{followed.length}</p>
              <p className="mt-2.5 text-[12.5px] text-muted-foreground">
                {archived > 0 ? <>et <span className="num">{archived}</span> archivée{archived > 1 ? "s" : ""}</> : "Aucune archivée"}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-5">
            <p className="eyebrow">Répartition par statut</p>
            <div>
              <div className="mb-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                {followed.length > 0
                  ? SEGMENTS.map((s) => {
                      const n = count(s.status);
                      return n ? <span key={s.status} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.className)} style={{ flexGrow: n }} /> : null;
                    })
                  : null}
              </div>
              <dl className="grid grid-cols-3 gap-3">
                {SEGMENTS.map((s) => (
                  <div key={s.status} className="min-w-0">
                    <dt className="flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-[3px]", s.className)} />
                      {s.label}
                    </dt>
                    <dd className="figure mt-1.5 pl-3.5 text-[24px]">{count(s.status)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Card>

        {/* Module secondaire : disponibilité des données (surface pastel informative). */}
        <Card className="flex flex-col border-transparent bg-accent p-6 shadow-none lg:col-span-5 dark:border-border" data-testid="portfolio-data">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-accent-foreground">
                <Database className="size-3.5" strokeWidth={2} aria-hidden /> Données importées
              </p>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="figure text-[34px]">{withData}</span>
                <span className="num text-[14px] text-muted-foreground">sur {followed.length} entreprise{followed.length > 1 ? "s" : ""}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 border-t border-primary/10 pt-3">
            {toComplete.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Toutes les entreprises suivies disposent d&apos;au moins un import enregistré.</p>
            ) : (
              <>
                <p className="mb-1 text-[12.5px] text-muted-foreground">Sans import enregistré</p>
                <ul>
                  {toComplete.slice(0, 3).map((c) => (
                    <li key={c.id} className="flex h-7 items-center justify-between gap-3">
                      <span className="truncate text-[13.5px] font-medium">{displayName(c)}</span>
                      <Link
                        href={`/daf/c/${c.id}/data`}
                        aria-label={`Importer des données pour ${displayName(c)}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-medium text-accent-foreground hover:bg-card"
                      >
                        Importer <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
                {toComplete.length > 3 ? <p className="mt-1 text-[12.5px] text-muted-foreground">et {toComplete.length - 3} autre{toComplete.length - 3 > 1 ? "s" : ""}</p> : null}
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 pb-4 pt-6">
          <h2 className="text-[19px] font-semibold tracking-[-0.015em]">Entreprises</h2>
          <p className="text-[13px] text-muted-foreground">
            <span className="num">{companies.length}</span> au total · indicateurs financiers disponibles avec les tableaux de bord
          </p>
        </div>
        {companies.length === 0 ? (
          <EmptyState className="mx-6 mb-6" icon={Building2} title="Aucune entreprise pour le moment">
            {isAdmin ? "Créez la première fiche entreprise pour commencer l'accompagnement." : "Aucune entreprise ne vous est encore affectée."}
          </EmptyState>
        ) : (
          <>
            {/* Mobile : liste empilée, avec accès direct aux données et aux SIG. */}
            <ul className="divide-y border-t md:hidden">
              {companies.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <Monogram company={c} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <Link id={`m-company-${c.id}`} href={`/daf/c/${c.id}`} className="line-clamp-2 font-medium leading-snug underline-offset-4 hover:underline">
                          {displayName(c)}
                        </Link>
                        <Badge variant={COMPANY_STATUS_VARIANTS[c.status]} className="shrink-0">{COMPANY_STATUS_LABELS[c.status]}</Badge>
                      </div>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        {c.leadAdvisorName ?? "Non attribué"} · {c.dataVersion === 0 ? "aucune donnée importée" : "données importées"}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <ActionLink href={`/daf/c/${c.id}/data`} describedBy={`m-company-${c.id}`} icon={<Database />}>Données</ActionLink>
                        <ActionLink href={`/daf/c/${c.id}/sig`} describedBy={`m-company-${c.id}`} icon={<Layers />}>SIG</ActionLink>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Table data-testid="portfolio-table" className="hidden table-fixed md:table">
              <TableHeader>
                <TableRow className="border-t">
                  <TableHead>Entreprise</TableHead>
                  <TableHead className="w-[180px]">DAF référent</TableHead>
                  <TableHead className="hidden w-[130px] xl:table-cell">Données</TableHead>
                  <TableHead className="w-[132px]">Statut</TableHead>
                  <TableHead className="hidden w-[120px] text-right xl:table-cell">Mise à jour</TableHead>
                  <TableHead className="w-[196px] text-right">Accès rapide</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <Monogram company={c} />
                        <div className="min-w-0">
                          <Link
                            id={`company-${c.id}`}
                            href={`/daf/c/${c.id}`}
                            title={displayName(c)}
                            className="block truncate font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            {displayName(c)}
                          </Link>
                          <p className="truncate text-[12.5px] text-muted-foreground" title={secondary(c) ?? undefined}>
                            {secondary(c) ?? "Secteur non renseigné"}
                            <span className="xl:hidden"> · {c.dataVersion === 0 ? "aucune donnée" : "données importées"}</span>
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="truncate" title={c.leadAdvisorName ?? undefined}>
                      {c.leadAdvisorName ?? <span className="text-muted-foreground">Non attribué</span>}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {c.dataVersion === 0 ? <span className="text-muted-foreground">Aucune donnée</span> : "Importées"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={COMPANY_STATUS_VARIANTS[c.status]}>{COMPANY_STATUS_LABELS[c.status]}</Badge>
                    </TableCell>
                    <TableCell num className="hidden text-[13px] text-muted-foreground xl:table-cell">{shortDate.format(c.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <ActionLink href={`/daf/c/${c.id}/data`} describedBy={`company-${c.id}`} icon={<Database />}>Données</ActionLink>
                        <ActionLink href={`/daf/c/${c.id}/sig`} describedBy={`company-${c.id}`} icon={<Layers />}>SIG</ActionLink>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>
    </>
  );
}

function Monogram({ company }: { company: Company }) {
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 font-display text-[11.5px] font-bold text-muted-foreground">
      {monogram(company)}
    </span>
  );
}

/** Accès direct libellé ; la ligne (nom de l'entreprise) complète la description accessible. */
function ActionLink({ href, describedBy, icon, children }: { href: string; describedBy: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-describedby={describedBy}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-accent-foreground [&_svg]:size-3.5 [&_svg]:text-muted-foreground hover:[&_svg]:text-accent-foreground"
    >
      {icon}
      {children}
    </Link>
  );
}
