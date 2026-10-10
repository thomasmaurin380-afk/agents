import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BANK_FIELDS, TRIAL_BALANCE_FIELDS } from "@/domain/imports/fields";
import type { ImportIssue } from "@/domain/imports/issues";
import { cancelImportAction } from "@/features/data/actions";
import { DeleteImportDialog } from "@/features/data/delete-import-dialog";
import { toDeletionView } from "@/features/data/deletion-view";
import { DATA_STATUS_LABELS, displayValue, IMPORT_STATUS_HELP, IMPORT_STATUS_LABELS, IMPORT_STATUS_VARIANTS } from "@/features/data/format";
import { ImportSteps } from "@/features/data/import-steps";
import { CommitForm, MappingForm } from "@/features/data/import-workspace";
import { IssueList } from "@/features/data/issues";
import { KeyValues } from "@/features/data/key-values";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getDeletionPreview } from "@/services/import-deletion";
import { getImportWorkspace } from "@/services/imports";

export const metadata: Metadata = { title: "Import" };

type Report = {
  format: string;
  encoding: string | null;
  summary: Record<string, unknown>;
  counts: Record<string, number>;
  accounts: { nouveaux: number; aVerifier: number };
  issues: ImportIssue[];
  issueCount: number;
};

export default async function ImportPage({ params, searchParams }: PageProps<"/daf/c/[companyId]/imports/[importId]">) {
  const { companyId, importId } = await params;
  const { supprimer } = await searchParams;
  const actor = await requireStaff();
  const ws = await orNotFound(getImportWorkspace(actor, companyId, importId));
  const f = ws.file;
  const base = `/daf/c/${companyId}`;
  const context = [
    ws.kindLabel,
    ws.fiscalYear ? ws.fiscalYear.label : null,
    f.periodEnd ? `arrêté au ${displayValue(f.periodEnd)}` : null,
    f.dataStatus === "final" || f.dataStatus === "provisional" ? DATA_STATUS_LABELS[f.dataStatus] : null,
    ws.bankAccount ? `${ws.bankAccount.label} — ${ws.bankAccount.bankName}` : null,
  ].filter(Boolean).join(" · ");
  const deletable = f.status === "committed" || f.status === "superseded";
  const deletionView = deletable ? toDeletionView(await getDeletionPreview(actor, companyId, importId)) : null;

  return (
    <>
      <PageHeader
        title={f.originalName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={IMPORT_STATUS_VARIANTS[f.status]} data-testid="import-status">{IMPORT_STATUS_LABELS[f.status]}</Badge>
            {context}
          </span>
        }
        actions={<Link href={`${base}/data`} className={buttonVariants({ variant: "outline" })}>Retour à l&apos;historique</Link>}
      />
      <p className="-mt-4 mb-4 text-sm text-muted-foreground" data-testid="import-status-help">{IMPORT_STATUS_HELP[f.status]}</p>
      <ImportSteps status={f.status} kind={f.kind} />

      {ws.prepared ? (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contrôles</CardTitle>
              <CardDescription>Calculés à partir du fichier original, selon la correspondance ci-dessous.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <KeyValues values={ws.prepared.summary} />
              <IssueList issues={ws.prepared.issues} total={ws.prepared.issueCount} />
            </CardContent>
          </Card>

          {ws.prepared.kind !== "fec" && ws.prepared.mapping ? (
            <Card>
              <CardHeader>
                <CardTitle>Correspondance des colonnes</CardTitle>
                <CardDescription>
                  {ws.prepared.mappingSource === "template"
                    ? "Modèle mémorisé pour ce format de fichier appliqué automatiquement : vous pouvez le modifier avant l'enregistrement."
                    : ws.prepared.mappingSource === "saved"
                      ? "Correspondance enregistrée pour cet import."
                      : "Correspondance proposée d'après les en-têtes : vérifiez-la."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <MappingForm
                  companyId={companyId}
                  importId={importId}
                  kind={ws.prepared.kind}
                  fields={ws.prepared.kind === "trial_balance" ? TRIAL_BALANCE_FIELDS : BANK_FIELDS}
                  headers={ws.prepared.headers}
                  mapping={ws.prepared.mapping as never}
                />
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Premières lignes du fichier (brutes)</p>
                  <Table>
                    <TableHeader>
                      <TableRow>{ws.prepared.headers.map((h, i) => <TableHead key={i}>{`${i + 1}. ${h}`}</TableHead>)}</TableRow>
                    </TableHeader>
                    <TableBody>
                      {ws.prepared.rawPreview.map((r, i) => (
                        <TableRow key={i}>{ws.prepared!.headers.map((_, j) => <TableCell key={j} className="font-mono text-xs">{r[j] ?? ""}</TableCell>)}</TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Alert variant="info">Format FEC normé (article A47 A-1 du LPF) : la correspondance des colonnes est fixe.</Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Aperçu des données normalisées</CardTitle>
              <CardDescription>30 premières lignes, telles qu&apos;elles seront enregistrées.</CardDescription>
            </CardHeader>
            <CardContent>
              {ws.prepared.previewLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune ligne exploitable avec la correspondance actuelle.</p>
              ) : (
                <Table data-testid="normalized-preview">
                  <TableHeader>
                    <TableRow>{Object.keys(ws.prepared.previewLines[0]).map((k) => <TableHead key={k}>{k}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {ws.prepared.previewLines.map((l, i) => (
                      <TableRow key={i}>{Object.values(l).map((v, j) => <TableCell key={j} className="tabular-nums">{displayValue(v)}</TableCell>)}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation</CardTitle>
              <CardDescription>L&apos;enregistrement est atomique : tout ou rien. Il est journalisé.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              <CommitForm
                companyId={companyId}
                importId={importId}
                blocking={ws.prepared.blocking}
                supersedes={ws.prepared.supersedes?.label ?? null}
                canSaveTemplate={ws.prepared.kind !== "fec"}
              />
              <form action={cancelImportAction.bind(null, companyId, importId)} className="text-right">
                <Button type="submit" variant="outline">Annuler l&apos;import</Button>
                <p className="mt-1 max-w-64 text-xs text-muted-foreground">Rien n&apos;a encore été enregistré : le fichier est simplement abandonné.</p>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6">
          <ImportReport report={f.report as Report | null} status={f.status} />
          {deletionView ? (
            <Card>
              <CardHeader>
                <CardTitle>Import effectué par erreur ?</CardTitle>
                <CardDescription>
                  La suppression définitive retire les données enregistrées par ce fichier, après confirmation.
                  Pour corriger une balance ou un FEC, vous pouvez aussi importer une version corrigée, qui remplacera celle-ci.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeleteImportDialog companyId={companyId} importId={importId} view={deletionView} defaultOpen={supprimer === "1"} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}

function ImportReport({ report, status }: { report: Report | null; status: string }) {
  if (!report) return <Alert>Import {status === "cancelled" ? "annulé" : "sans rapport"}.</Alert>;
  const counts: Record<string, unknown> = {
    "Lignes enregistrées": report.counts.lignesEnregistrees,
    ...(report.counts.doublons != null ? { "Doublons ignorés": report.counts.doublons } : {}),
    ...(report.counts.ecritures != null ? { Écritures: report.counts.ecritures } : {}),
    "Nouveaux comptes": report.accounts.nouveaux,
    "Comptes à vérifier": report.accounts.aVerifier,
    "Format lu": `${report.format.toUpperCase()}${report.encoding ? ` (${report.encoding})` : ""}`,
  };
  return (
    <div className="grid gap-6" data-testid="import-report">
      <Card>
        <CardHeader>
          <CardTitle>Rapport d&apos;import</CardTitle>
          <CardDescription>
            {status === "superseded" ? "Cet import a depuis été remplacé par une version plus récente." : "Données enregistrées et tracées."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <KeyValues values={{ ...report.summary, ...counts }} />
          <IssueList issues={report.issues} total={report.issueCount} />
        </CardContent>
      </Card>
    </div>
  );
}
