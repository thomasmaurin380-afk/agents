import { ArrowUpRight, Building2, Database, Layers, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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

const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Paris" });

/** Répartition du portefeuille : uniquement des comptages réels (aucune donnée financière). */
const SEGMENTS = [
  { status: "active", label: "Actives", className: "bg-primary" },
  { status: "onboarding", label: "En intégration", className: "bg-primary/40" },
  { status: "paused", label: "En pause", className: "bg-subtle-foreground/50" },
] as const;

export default async function PortfolioPage() {
  const actor = await requireStaff();
  const companies = await listPortfolio(actor);
  const isAdmin = adminFirmIds(actor).length > 0;
  const followed = companies.filter((c) => c.status !== "archived");
  const archived = companies.length - followed.length;
  const withData = followed.filter((c) => c.dataVersion > 0);
  const toComplete = followed.filter((c) => c.dataVersion === 0);
  const count = (s: string) => followed.filter((c) => c.status === s).length;
  const firstName = actor.fullName.split(/\s+/)[0];
  const name = (c: (typeof companies)[number]) => c.tradeName ?? c.legalName;

  return (
    <>
      <PageHeader
        eyebrow={<>Bonjour {firstName} · <span className="first-letter:uppercase">{today.format(new Date())}</span></>}
        title="Portefeuille clients"
        description={`${actor.firms[0]?.firmName ?? "Cabinet"} — vue d'ensemble des entreprises que vous accompagnez.`}
        actions={
          isAdmin ? (
            <Link href="/daf/companies/new" className={buttonVariants()}>
              <Plus /> Nouvelle entreprise
            </Link>
          ) : null
        }
      />

      <div className="mb-6 grid gap-5 lg:grid-cols-12">
        {/* Point focal : taille et composition du portefeuille. */}
        <Card className="flex flex-col justify-between gap-8 p-6 sm:p-7 lg:col-span-7" data-testid="portfolio-summary">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Entreprises suivies</p>
              <p className="figure mt-4 text-[64px] sm:text-[72px]">{followed.length}</p>
            </div>
            <p className="pt-0.5 text-right text-[12.5px] text-muted-foreground">
              {archived > 0 ? <>+ <span className="num">{archived}</span> archivée{archived > 1 ? "s" : ""}<br /></> : null}
              Répartition par statut
            </p>
          </div>
          <div>
            {followed.length > 0 ? (
              <div className="mb-5 flex h-2 gap-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                {SEGMENTS.map((s) => {
                  const n = count(s.status);
                  return n ? <span key={s.status} className={cn("h-full rounded-full", s.className)} style={{ flexGrow: n }} /> : null;
                })}
              </div>
            ) : null}
            <dl className="grid grid-cols-3 gap-4">
              {SEGMENTS.map((s) => (
                <div key={s.status} className="border-l pl-3 first:border-l-0 first:pl-0 sm:pl-4">
                  <dt className="flex items-center gap-1.5 text-[12.5px] leading-tight text-muted-foreground">
                    <span aria-hidden className={cn("size-2 shrink-0 rounded-sm", s.className)} />
                    {s.label}
                  </dt>
                  <dd className="figure mt-2 text-[26px]">{count(s.status)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>

        {/* Module secondaire : disponibilité des données (surface pastel informative). */}
        <Card className="flex flex-col border-transparent bg-accent p-6 shadow-none sm:p-7 lg:col-span-5 dark:border-border" data-testid="portfolio-data">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12.5px] font-medium text-accent-foreground">Données importées</p>
              <p className="figure mt-3 text-[40px]">
                {withData.length}
                <span className="text-[22px] font-medium text-muted-foreground"> / {followed.length}</span>
              </p>
              <p className="mt-2 text-[12.5px] text-muted-foreground">entreprises disposent d&apos;au moins un import enregistré</p>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-accent-foreground">
              <Database className="size-[18px]" strokeWidth={1.75} aria-hidden />
            </span>
          </div>
          <div className="mt-6 border-t border-primary/10 pt-4">
            {toComplete.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Toutes les entreprises suivies disposent de données importées.</p>
            ) : (
              <>
                <p className="mb-2 text-[12.5px] font-medium text-foreground">À compléter</p>
                <ul className="space-y-1">
                  {toComplete.slice(0, 3).map((c) => (
                    <li key={c.id}>
                      <Link href={`/daf/c/${c.id}/data`} className="group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 text-[13.5px] hover:bg-card">
                        <span className="truncate">{name(c)}</span>
                        <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-primary dark:text-info-text">
                          Importer <ArrowUpRight className="size-3.5" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {toComplete.length > 3 ? <p className="mt-2 text-[12px] text-muted-foreground">et {toComplete.length - 3} autre{toComplete.length - 3 > 1 ? "s" : ""}</p> : null}
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div>
            <h2 className="text-[19px] font-semibold tracking-[-0.015em]">Entreprises</h2>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Statut, référent et disponibilité des données. Les indicateurs financiers s&apos;ajouteront avec les tableaux de bord.
            </p>
          </div>
          <p className="num text-[13px] text-muted-foreground">{companies.length} au total</p>
        </div>
        {companies.length === 0 ? (
          <EmptyState className="mx-5 mb-5 sm:mx-6" icon={Building2} title="Aucune entreprise pour le moment">
            {isAdmin ? "Créez la première fiche entreprise pour commencer l'accompagnement." : "Aucune entreprise ne vous est encore affectée."}
          </EmptyState>
        ) : (
          <>
          {/* Mobile : liste empilée ; le tableau complet reste disponible à partir de la tablette. */}
          <ul className="divide-y border-t md:hidden">
            {companies.map((c) => (
              <li key={c.id}>
                <Link href={`/daf/c/${c.id}`} className="flex items-start gap-3 px-5 py-4 hover:bg-surface-2/45">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name(c)}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{c.leadAdvisorName ?? "Non attribué"}</span>
                    <span className="block text-[12.5px] text-muted-foreground">{c.dataVersion === 0 ? "Aucune donnée importée" : "Données importées"}</span>
                  </span>
                  <Badge variant={COMPANY_STATUS_VARIANTS[c.status]}>{COMPANY_STATUS_LABELS[c.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <Table data-testid="portfolio-table" className="hidden min-w-[600px] md:table">
            <TableHeader>
              <TableRow className="border-t">
                <TableHead>Entreprise</TableHead>
                <TableHead className="hidden xl:table-cell">Secteur</TableHead>
                <TableHead>DAF référent</TableHead>
                <TableHead className="hidden xl:table-cell">Données</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden text-right xl:table-cell">Mise à jour</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell className="py-3.5">
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 font-display text-[11.5px] font-bold text-muted-foreground">
                        {name(c).replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")}
                      </span>
                      <div className="min-w-0">
                        <Link id={`company-${c.id}`} href={`/daf/c/${c.id}`} className="whitespace-nowrap font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
                          {name(c)}
                        </Link>
                        {c.tradeName ? <p className="max-w-56 truncate text-[12.5px] text-muted-foreground">{c.legalName}</p> : null}
                        <p className="text-[12.5px] text-muted-foreground xl:hidden">{c.dataVersion === 0 ? "Aucune donnée importée" : "Données importées"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-44 truncate text-muted-foreground xl:table-cell" title={c.sector ?? undefined}>{c.sector ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.leadAdvisorName ?? <span className="text-muted-foreground">Non attribué</span>}</TableCell>
                  <TableCell className="hidden whitespace-nowrap xl:table-cell">
                    {c.dataVersion === 0 ? (
                      <span className="text-muted-foreground">Aucune donnée importée</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5"><Database className="size-3.5 text-muted-foreground" aria-hidden />Données importées</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={COMPANY_STATUS_VARIANTS[c.status]}>{COMPANY_STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  <TableCell num className="hidden text-[13px] text-muted-foreground xl:table-cell">{shortDate.format(c.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 opacity-80 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <RowLink href={`/daf/c/${c.id}/data`} label="Données comptables" describedBy={`company-${c.id}`}><Database /></RowLink>
                      <RowLink href={`/daf/c/${c.id}/sig`} label="Soldes intermédiaires de gestion" describedBy={`company-${c.id}`}><Layers /></RowLink>
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

/** Raccourci d'action de ligne (icône + infobulle ; nom accessible sans ambiguïté). */
function RowLink({ href, label, describedBy, children }: { href: string; label: string; describedBy: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-describedby={describedBy}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4"
    >
      {children}
    </Link>
  );
}
