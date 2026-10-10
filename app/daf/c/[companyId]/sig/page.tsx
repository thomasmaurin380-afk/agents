import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fiscalMonths } from "@/domain/sig/periods";
import { fmtDateTime, PERIOD_KIND_LABELS, SNAPSHOT_STATUS, SOURCE_KIND_LABELS } from "@/features/sig/format";
import { OverrideForm, ValidateSigForm } from "@/features/sig/forms";
import { ChecksPanel, SigTable } from "@/features/sig/sig-table";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getSigWorkspace } from "@/services/sig";

export const metadata: Metadata = { title: "SIG" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function SigPage({ params, searchParams }: PageProps<"/daf/c/[companyId]/sig">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const actor = await requireStaff();
  const q = {
    fiscalYearId: one(sp.exercice),
    period: (one(sp.periode) ?? "fiscal_year") as "fiscal_year" | "ytd" | "month",
    month: one(sp.mois) ? Number(one(sp.mois)) : null,
    source: (one(sp.source) ?? "auto") as "auto" | "trial_balance" | "fec",
    justification: one(sp.justification) ?? null,
  };
  const ws = await orNotFound(getSigWorkspace(actor, companyId, q));
  const base = `/daf/c/${companyId}`;
  const isAdmin = ws.access.role === "firm_admin";
  const r = ws.report;

  if (!r) {
    return (
      <>
        <PageHeader title="Soldes intermédiaires de gestion" />
        <Alert variant="warning">Données insuffisantes : aucun exercice n&apos;est défini. Créez-le dans <Link className="underline" href={`${base}/data`}>Données comptables</Link>.</Alert>
      </>
    );
  }
  const fy = r.fiscalYear;
  const months = fiscalMonths(fy);
  const hidden: Record<string, string> = {
    fiscalYearId: fy.id, period: r.period.kind, ...(r.period.month ? { month: String(r.period.month) } : {}),
    source: q.source, ...(q.justification ? { justification: q.justification } : {}),
  };

  return (
    <>
      <PageHeader
        title="Soldes intermédiaires de gestion"
        description={`${ws.access.company.tradeName ?? ws.access.company.legalName} — ${r.period.label}`}
        actions={<Link href="/daf/sig-rules" className={buttonVariants({ variant: "outline" })}>Référentiel SIG</Link>}
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form method="get" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6" data-testid="sig-selector">
            <div className="space-y-1.5">
              <Label htmlFor="exercice">Exercice</Label>
              <Select id="exercice" name="exercice" defaultValue={fy.id}>
                {ws.years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periode">Période</Label>
              <Select id="periode" name="periode" defaultValue={r.period.kind}>
                {Object.entries(PERIOD_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mois">Mois (cumul ou isolé)</Label>
              <Select id="mois" name="mois" defaultValue={String(r.period.month ?? months.length)}>
                {months.map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Select id="source" name="source" defaultValue={q.source}>
                <option value="auto">Automatique</option>
                <option value="trial_balance">Balance comptable</option>
                <option value="fec">FEC</option>
              </Select>
            </div>
            <div className="space-y-1.5 lg:col-span-1">
              <Label htmlFor="justification">Justification du choix</Label>
              <Input id="justification" name="justification" defaultValue={q.justification ?? ""} placeholder="Si les deux sources existent" />
            </div>
            <Button type="submit" variant="outline">Calculer</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Balance : {r.availability.trial_balance.available ? "disponible" : r.availability.trial_balance.reason}{" · "}
            FEC : {r.availability.fec.available ? "disponible" : r.availability.fec.reason}{" · "}
            Les relevés bancaires ne sont jamais utilisés pour les SIG.
          </p>
        </CardContent>
      </Card>

      {r.status === "insufficient" ? (
        <Alert variant="warning" data-testid="sig-insufficient">Données insuffisantes — {r.reason}</Alert>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="sig-context">
            <Badge variant={SNAPSHOT_STATUS.provisional.variant}>{SNAPSHOT_STATUS.provisional.label}</Badge>
            <Badge variant="outline">{r.ruleSet.code} v{r.ruleSet.version}</Badge>
            <Badge variant="outline">{SOURCE_KIND_LABELS[r.decision.kind]}{r.decision.choice === "explicit" ? " (choix du DAF)" : ""}</Badge>
            {r.approved ? null : <Badge variant="warning">Référentiel non encore validé par le cabinet</Badge>}
            <span className="text-muted-foreground">Sources : {r.content.source.refs.map((x) => x.role + (x.fileName ? ` — ${x.fileName}` : "")).join(" ; ")}</span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tableau des SIG</CardTitle>
              <CardDescription>Calcul provisoire, non enregistré. Cliquez sur une rubrique pour voir les comptes qui la composent.</CardDescription>
            </CardHeader>
            <CardContent>
              <SigTable
                content={r.content}
                detail
                entriesHref={r.decision.kind === "fec" ? (acc) => `${base}/sig/entries?exercice=${fy.id}&compte=${encodeURIComponent(acc)}&du=${r.period.start}&au=${r.period.end}` : undefined}
              />
              <p className="mt-3 text-xs text-muted-foreground" data-testid="sig-reconciliation">
                Rapprochement : résultat des SIG {r.content.reconciliation.sigResult} € — solde des classes 6 et 7 {r.content.reconciliation.accountingResult} € — écart {r.content.reconciliation.gap} €.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contrôles</CardTitle>
              <CardDescription>Un contrôle bloquant interdit la validation ; les avertissements sont conservés dans la version figée.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ChecksPanel checks={r.content.checks} />
              {r.unresolved.filter((u) => u.reason !== "no_pcg").length ? (
                isAdmin ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Classer les comptes (exception propre à cette entreprise, justifiée et historisée)</p>
                    {r.unresolved.filter((u) => u.reason !== "no_pcg").map((u) => (
                      <div key={u.account}>
                        <p className="text-sm"><span className="font-mono">{u.account}</span> {u.label} — PCG {u.pcgAccount}{u.note ? ` — ${u.note}` : ""}</p>
                        <OverrideForm companyId={companyId} ruleSetCode={r.ruleSet.code} account={u.account} proposal={u.proposal} lines={r.ruleSet.lines.map((l) => ({ code: l.code, label: l.label }))} />
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Le classement des comptes est réservé à l&apos;administrateur du cabinet.</p>
              ) : null}
              {r.unresolved.some((u) => u.reason === "no_pcg") ? (
                <Link href={`${base}/accounts`} className={buttonVariants({ variant: "outline", size: "sm" })}>Rattacher les comptes au PCG</Link>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation</CardTitle>
              <CardDescription>
                La validation fige cette version (montants, sources, référentiel, contrôles, empreinte d&apos;intégrité). Elle n&apos;est pas visible du client tant qu&apos;elle n&apos;est pas publiée.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {r.blocking ? <Alert variant="destructive" className="mb-3">Validation impossible : contrôles bloquants à traiter.</Alert> : null}
              <ValidateSigForm companyId={companyId} params={hidden} contentHash={r.contentHash} disabled={r.blocking} />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Versions figées</CardTitle>
          <CardDescription>Historique conservé ; une version devient obsolète si les données ou le référentiel ont changé depuis sa validation.</CardDescription>
        </CardHeader>
        <CardContent>
          {ws.snapshots.length === 0 ? <p className="text-sm text-muted-foreground">Aucune version validée.</p> : (
            <Table data-testid="sig-history">
              <TableHeader>
                <TableRow><TableHead>Période</TableHead><TableHead>Source</TableHead><TableHead>Référentiel</TableHead><TableHead>Statut</TableHead><TableHead>Validée</TableHead><TableHead>Publiée</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {ws.snapshots.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{PERIOD_KIND_LABELS[s.periodKind as keyof typeof PERIOD_KIND_LABELS]} — {s.periodStart} → {s.periodEnd}</TableCell>
                    <TableCell>{SOURCE_KIND_LABELS[s.source as keyof typeof SOURCE_KIND_LABELS]}</TableCell>
                    <TableCell>{s.ruleSetCode}</TableCell>
                    <TableCell className="space-x-1">
                      <Badge variant={SNAPSHOT_STATUS[s.status as "validated"].variant}>{SNAPSHOT_STATUS[s.status as "validated"].label}</Badge>
                      {s.obsolete ? <Badge variant="destructive">Obsolète</Badge> : null}
                    </TableCell>
                    <TableCell>{fmtDateTime(s.validatedAt)} — {s.validatedByName ?? ""}</TableCell>
                    <TableCell>{s.publishedAt ? `${fmtDateTime(s.publishedAt)} — ${s.publishedByName ?? ""}` : "—"}</TableCell>
                    <TableCell><Link className="underline" href={`${base}/sig/v/${s.id}`}>Ouvrir</Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {ws.overrides.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Exceptions de classement de l&apos;entreprise</CardTitle>
            <CardDescription>Historique complet ; seule la dernière décision par compte et par référentiel est active.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Compte</TableHead><TableHead>Référentiel</TableHead><TableHead>Proposée</TableHead><TableHead>Retenue</TableHead><TableHead>Justification</TableHead><TableHead>Auteur</TableHead><TableHead>État</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {ws.overrides.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.account} <span className="text-muted-foreground">({o.pcgAccount})</span></TableCell>
                    <TableCell>{o.ruleSetCode}</TableCell>
                    <TableCell>{o.proposedLine ?? "—"}</TableCell>
                    <TableCell>{o.line}</TableCell>
                    <TableCell>{o.justification}</TableCell>
                    <TableCell>{o.createdBy} — {fmtDateTime(o.createdAt)}</TableCell>
                    <TableCell>{o.replacedAt ? `Remplacée le ${fmtDateTime(o.replacedAt)}` : <Badge variant="success">Active</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
