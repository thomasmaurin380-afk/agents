import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime } from "@/features/sig/format";
import { ApproveRuleSetForm } from "@/features/sig/forms";
import { requireStaff } from "@/lib/guards";
import { getRuleSetsOverview } from "@/services/sig";

export const metadata: Metadata = { title: "Référentiel SIG" };

const STATUS = {
  certain: { label: "Automatique", variant: "secondary" },
  review: { label: "À confirmer par le DAF", variant: "warning" },
  transitional: { label: "Transitoire (à réimputer)", variant: "warning" },
  removed: { label: "Incompatible (reclassement)", variant: "destructive" },
} as const;
const BASIS = { pcg: "Règle PCG", cabinet: "Convention du cabinet" } as const;

export default async function SigRulesPage() {
  const actor = await requireStaff();
  const o = await getRuleSetsOverview(actor);
  return (
    <>
      <PageHeader eyebrow="Cabinet" title="Référentiel SIG" description="Règles communes de rattachement des comptes aux SIG, versionnées par plan comptable. Les exceptions propres à une entreprise se gèrent depuis sa page SIG." />
      <Alert variant="info" className="mb-6">
        Aucune version des SIG ne peut être publiée à un client tant que le référentiel concerné n&apos;a pas été validé, avec ses hypothèses, par un administrateur du cabinet.
        Toute modification des règles change l&apos;empreinte du référentiel et impose une nouvelle validation.
      </Alert>
      <div className="grid gap-6">
        {o.ruleSets.map(({ ruleSet: rs, hash, approval }) => {
          const label = new Map(rs.lines.map((l) => [l.code, l.label]));
          return (
            <Card key={rs.code} data-testid={`ruleset-${rs.code}`}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {rs.code} — version {rs.version}
                  {approval ? <Badge variant="success">Validé le {fmtDateTime(approval.approvedAt)} par {approval.approvedBy}</Badge> : <Badge variant="warning">Non validé</Badge>}
                </CardTitle>
                <CardDescription>{rs.label}. Empreinte : <span className="font-mono">{hash.slice(0, 16)}…</span></CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="eyebrow mb-3">Choix de présentation du cabinet soumis à validation</p>
                  <ul className="divide-y rounded-lg border">
                    {rs.hypotheses.map((h) => (
                      <li key={h.id} className="flex gap-3 px-4 py-3 text-sm leading-relaxed">
                        <span className="mt-0.5 h-fit shrink-0 rounded bg-info-surface px-1.5 font-mono text-xs font-semibold text-info-text">{h.id}</span>
                        <span>{h.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <details>
                  <summary className="cursor-pointer rounded-md py-1 text-sm font-medium text-primary hover:underline dark:text-info-text">Formules ({rs.aggregates.length})</summary>
                  <ul className="mt-2 space-y-1 text-sm">{rs.aggregates.map((a) => <li key={a.code}><strong>{a.label}</strong> = {a.definition}</li>)}</ul>
                </details>
                <details>
                  <summary className="cursor-pointer rounded-md py-1 text-sm font-medium text-primary hover:underline dark:text-info-text">Règles par préfixe PCG ({rs.rules.length}) — la plus spécifique s&apos;applique</summary>
                  <Table className="mt-2">
                    <TableHeader><TableRow><TableHead>Préfixe</TableHead><TableHead>Rubrique</TableHead><TableHead>Statut</TableHead><TableHead>Fondement</TableHead><TableHead>Référence / justification</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {[...rs.rules].sort((a, b) => a.prefix.localeCompare(b.prefix)).map((r) => (
                        <TableRow key={r.prefix}>
                          <TableCell className="font-mono font-medium">{r.prefix}</TableCell>
                          <TableCell>{r.line ? label.get(r.line) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                            {r.autoWhen ? <p className="mt-1 text-xs text-muted-foreground">automatique sans activité de marchandises</p> : null}
                          </TableCell>
                          <TableCell><Badge variant={r.basis === "cabinet" ? "info" : "outline"}>{BASIS[r.basis]}</Badge></TableCell>
                          <TableCell className="min-w-72 text-xs leading-relaxed text-muted-foreground">{r.reference}{r.note ? ` — ${r.note}` : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
                {approval ? null : o.canApprove ? <ApproveRuleSetForm ruleSetCode={rs.code} /> : <p className="text-sm text-muted-foreground">Validation réservée à l&apos;administrateur du cabinet.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
