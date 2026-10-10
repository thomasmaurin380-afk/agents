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

const STATUS = { certain: "Automatique", review: "À confirmer par le DAF", transitional: "Transitoire (à réimputer)", removed: "Incompatible (reclassement)" } as const;
const BASIS = { pcg: "Règle PCG", cabinet: "Convention du cabinet" } as const;

export default async function SigRulesPage() {
  const actor = await requireStaff();
  const o = await getRuleSetsOverview(actor);
  return (
    <>
      <PageHeader title="Référentiel SIG" description="Règles communes de rattachement des comptes aux SIG, versionnées par plan comptable. Les exceptions propres à une entreprise se gèrent depuis sa page SIG." />
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
                  <p className="mb-2 text-sm font-medium">Choix de présentation du cabinet soumis à validation</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {rs.hypotheses.map((h) => <li key={h.id}><span className="font-mono text-xs">{h.id}</span> {h.text}</li>)}
                  </ul>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Formules ({rs.aggregates.length})</summary>
                  <ul className="mt-2 space-y-1 text-sm">{rs.aggregates.map((a) => <li key={a.code}><strong>{a.label}</strong> = {a.definition}</li>)}</ul>
                </details>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">Règles par préfixe PCG ({rs.rules.length}) — la plus spécifique s&apos;applique</summary>
                  <Table className="mt-2">
                    <TableHeader><TableRow><TableHead>Préfixe</TableHead><TableHead>Rubrique</TableHead><TableHead>Statut</TableHead><TableHead>Fondement</TableHead><TableHead>Référence / justification</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {[...rs.rules].sort((a, b) => a.prefix.localeCompare(b.prefix)).map((r) => (
                        <TableRow key={r.prefix}>
                          <TableCell className="font-mono">{r.prefix}</TableCell>
                          <TableCell>{r.line ? label.get(r.line) : "—"}</TableCell>
                          <TableCell>{STATUS[r.status]}{r.autoWhen ? " (automatique sans activité de marchandises)" : ""}</TableCell>
                          <TableCell>{BASIS[r.basis]}</TableCell>
                          <TableCell className="text-xs">{r.reference}{r.note ? ` — ${r.note}` : ""}</TableCell>
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
