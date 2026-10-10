import { CircleAlert, CircleCheck, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_KIND_LABELS } from "@/domain/imports/fields";
import { retryStorageCleanupAction } from "@/features/data/actions";
import { DATA_STATUS_LABELS, displayValue, IMPORT_STATUS_HELP, IMPORT_STATUS_LABELS, IMPORT_STATUS_VARIANTS } from "@/features/data/format";
import { BankAccountForm, FiscalYearForm } from "@/features/data/forms";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getDataOverview } from "@/services/imports";

export const metadata: Metadata = { title: "Données comptables" };

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default async function DataPage({ params, searchParams }: PageProps<"/daf/c/[companyId]/data">) {
  const { companyId } = await params;
  const { supprime, stockage } = await searchParams;
  const actor = await requireStaff();
  const d = await orNotFound(getDataOverview(actor, companyId));
  const base = `/daf/c/${companyId}`;
  const isAdmin = d.role === "firm_admin";
  const sources = [
    {
      label: "Balance comptable courante",
      ok: d.sources.tb,
      detail: d.latestBalance
        ? `dernière au ${displayValue(d.latestBalance.periodEnd)} (${DATA_STATUS_LABELS[d.latestBalance.dataStatus]})`
        : "nécessaire aux SIG et indicateurs comptables (sauf si un FEC est importé)",
    },
    { label: "FEC", ok: d.sources.fec, detail: d.sources.fec ? "écritures disponibles" : "alternative ou complément à la balance" },
    { label: "Relevés bancaires", ok: d.sources.bank, detail: d.sources.bank ? "opérations disponibles" : "nécessaires aux indicateurs de trésorerie" },
  ];
  return (
    <>
      <PageHeader
        title="Données comptables et bancaires"
        description={`${d.company.tradeName ?? d.company.legalName} — balances, FEC et relevés bancaires, quel que soit le logiciel d'origine.`}
        actions={
          <div className="flex gap-2">
            <Link href={`${base}/accounts`} className={buttonVariants({ variant: "outline" })}>Plan de comptes</Link>
            <Link href={`${base}/imports/new`} className={buttonVariants()}><Upload /> Nouvel import</Link>
          </div>
        }
      />
      {typeof supprime === "string" ? (
        <Alert variant="info" className="mb-6" data-testid="deletion-success">
          Import « {supprime} » supprimé définitivement. Les indicateurs reflètent désormais les données restantes.
          {stockage === "en-attente" ? " La suppression du fichier dans le stockage a échoué : elle sera relancée automatiquement." : ""}
        </Alert>
      ) : null}
      {d.pendingStorageCleanups > 0 ? (
        <Alert variant="warning" className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <span>{d.pendingStorageCleanups} fichier(s) d&apos;imports supprimés restent à effacer du stockage (échec précédent).</span>
          <form action={retryStorageCleanupAction.bind(null, companyId)}>
            <Button type="submit" size="sm" variant="outline">Relancer</Button>
          </form>
        </Alert>
      ) : null}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sources disponibles pour les SIG et KPI</CardTitle>
            <CardDescription>Ce qui alimentera les calculs (phases 3 et 4). Une source manquante donnera « Données insuffisantes ».</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-3" data-testid="data-sources">
              {sources.map((s) => (
                <li key={s.label} className="flex items-start gap-2">
                  {s.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Disponible" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Manquante" />}
                  <span><span className="font-medium">{s.label}</span><br /><span className="text-muted-foreground">{s.detail}</span></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Imports</CardTitle>
            <CardDescription>
              Chaque fichier est contrôlé avant enregistrement ; les originaux sont conservés. « Enregistré » signifie
              importé techniquement, et non validé par le DAF (la validation métier portera sur les SIG et rapports).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {d.imports.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun import pour le moment.</p>
            ) : (
              <Table data-testid="imports-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fichier</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Téléversé</TableHead>
                    <TableHead>Lignes enregistrées</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead><span className="sr-only">Action</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.imports.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link href={`${base}/imports/${i.id}`} className="font-medium hover:underline">{i.originalName}</Link>
                      </TableCell>
                      <TableCell>{IMPORT_KIND_LABELS[i.kind]}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {dateTime.format(i.createdAt)} · {i.createdByName ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{displayValue(i.rowCount)}</TableCell>
                      <TableCell>
                        <Badge variant={IMPORT_STATUS_VARIANTS[i.status]} title={IMPORT_STATUS_HELP[i.status]}>{IMPORT_STATUS_LABELS[i.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {i.status === "uploaded" || i.status === "mapped" ? (
                          <Link href={`${base}/imports/${i.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Reprendre</Link>
                        ) : isAdmin && (i.status === "committed" || i.status === "superseded") ? (
                          <Link href={`${base}/imports/${i.id}?supprimer=1`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`Supprimer l'import ${i.originalName}`}>
                            Supprimer…
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Exercices comptables</CardTitle>
              <CardDescription>Requis pour importer une balance ou un FEC. Exercices décalés acceptés.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table data-testid="fiscal-years">
                <TableBody>
                  {d.fiscalYears.length === 0 ? (
                    <TableRow><TableCell className="text-muted-foreground">Aucun exercice.</TableCell></TableRow>
                  ) : (
                    d.fiscalYears.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.label}</TableCell>
                        <TableCell className="text-muted-foreground">{displayValue(f.startDate)} → {displayValue(f.endDate)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <FiscalYearForm companyId={companyId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comptes bancaires</CardTitle>
              <CardDescription>Seuls les 4 derniers caractères de l&apos;IBAN sont conservés.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table data-testid="bank-accounts">
                <TableBody>
                  {d.bankAccounts.length === 0 ? (
                    <TableRow><TableCell className="text-muted-foreground">Aucun compte bancaire.</TableCell></TableRow>
                  ) : (
                    d.bankAccounts.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <p className="font-medium">{b.label}</p>
                          <p className="text-xs text-muted-foreground">{b.bankName}{b.ibanLast4 ? ` · …${b.ibanLast4}` : ""}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {b.transactionCount} opération(s){b.lastDate ? ` · jusqu'au ${displayValue(b.lastDate)}` : ""}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <BankAccountForm companyId={companyId} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
