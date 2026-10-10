import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValues } from "@/features/data/key-values";
import { fmtDateTime, SNAPSHOT_STATUS, SOURCE_KIND_LABELS } from "@/features/sig/format";
import { PublishSigForm } from "@/features/sig/forms";
import { ChecksPanel, SigTable } from "@/features/sig/sig-table";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getSnapshot } from "@/services/sig";

export const metadata: Metadata = { title: "Version figée des SIG" };

export default async function SnapshotPage({ params }: PageProps<"/daf/c/[companyId]/sig/v/[snapshotId]">) {
  const { companyId, snapshotId } = await params;
  const actor = await requireStaff();
  const { access, snapshot: s, content, integrity } = await orNotFound(getSnapshot(actor, companyId, snapshotId));
  const status = SNAPSHOT_STATUS[s.status as "validated"];
  return (
    <>
      <PageHeader
        title="Version figée des SIG"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant} data-testid="snapshot-status">{status.label}</Badge>
            {s.obsolete ? <Badge variant="destructive" data-testid="snapshot-obsolete">Obsolète</Badge> : null}
            {content.period.label}
          </span>
        }
        actions={<Link href={`/daf/c/${companyId}/sig`} className={buttonVariants({ variant: "outline" })}>Retour aux SIG</Link>}
      />
      {!integrity ? <Alert variant="destructive" className="mb-4">Empreinte d&apos;intégrité invalide : contenu altéré.</Alert> : null}
      {s.obsolete ? <Alert variant="warning" className="mb-4">Les données ou le référentiel ont changé depuis la validation : cette version ne peut plus être publiée. Recalculez et validez une nouvelle version.</Alert> : null}
      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle>Traçabilité</CardTitle></CardHeader>
          <CardContent>
            <KeyValues values={{
              Exercice: content.fiscalYear.label,
              Source: `${SOURCE_KIND_LABELS[content.source.kind]}${content.source.choice === "explicit" ? ` — choix du DAF : ${content.source.justification}` : ""}`,
              Fichiers: content.source.refs.map((r) => `${r.role} (${r.fileName ?? r.importId})`).join(" ; "),
              Référentiel: `${content.ruleSet.code} v${content.ruleSet.version} — ${content.ruleSet.label}`,
              "Moteur de calcul": content.engineVersion,
              "Validée": `${fmtDateTime(s.validatedAt)} par ${s.validatedByName ?? "—"}`,
              "Publiée": s.publishedAt ? `${fmtDateTime(s.publishedAt)} par ${s.publishedByName ?? "—"}` : "non",
              "Empreinte du contenu": s.contentHash.slice(0, 16) + "…",
            }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tableau des SIG</CardTitle><CardDescription>Valeurs figées au moment de la validation.</CardDescription></CardHeader>
          <CardContent><SigTable content={content} detail /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Contrôles au moment de la validation</CardTitle></CardHeader>
          <CardContent><ChecksPanel checks={content.checks} /></CardContent>
        </Card>
        {s.status === "validated" ? (
          <Card>
            <CardHeader>
              <CardTitle>Publication</CardTitle>
              <CardDescription>La publication rend cette version visible du dirigeant. Elle est réservée à l&apos;administrateur du cabinet et n&apos;est jamais automatique.</CardDescription>
            </CardHeader>
            <CardContent>
              {access.role === "firm_admin" && !s.obsolete ? <PublishSigForm companyId={companyId} snapshotId={s.id} /> : (
                <p className="text-sm text-muted-foreground">{s.obsolete ? "Version obsolète : publication impossible." : "Publication réservée à l'administrateur du cabinet."}</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
