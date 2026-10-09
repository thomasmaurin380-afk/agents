import { Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMPORT_KIND_LABELS } from "@/domain/imports/fields";
import { displayValue, IMPORT_STATUS_LABELS, IMPORT_STATUS_VARIANTS } from "@/features/data/format";
import { BankAccountForm, FiscalYearForm } from "@/features/data/forms";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getDataOverview } from "@/services/imports";

export const metadata: Metadata = { title: "Données comptables" };

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default async function DataPage({ params }: PageProps<"/daf/c/[companyId]/data">) {
  const { companyId } = await params;
  const actor = await requireStaff();
  const d = await orNotFound(getDataOverview(actor, companyId));
  const base = `/daf/c/${companyId}`;
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
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Imports</CardTitle>
            <CardDescription>Chaque fichier est contrôlé avant enregistrement ; les originaux sont conservés.</CardDescription>
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
                      <TableCell><Badge variant={IMPORT_STATUS_VARIANTS[i.status]}>{IMPORT_STATUS_LABELS[i.status]}</Badge></TableCell>
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
