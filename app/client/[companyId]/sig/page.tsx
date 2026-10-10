import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { euro, fmtDateTime, variationView } from "@/features/sig/format";
import { SigTable } from "@/features/sig/sig-table";
import { orNotFound, requireActor } from "@/lib/guards";
import { getPublishedSig } from "@/services/sig";

export const metadata: Metadata = { title: "Mes SIG" };

export default async function ClientSigPage({ params, searchParams }: PageProps<"/client/[companyId]/sig">) {
  const { companyId } = await params;
  const { version } = await searchParams;
  const actor = await requireActor();
  const { published, selected, content } = await orNotFound(getPublishedSig(actor, companyId, typeof version === "string" ? version : null));
  return (
    <>
      <PageHeader title="Mes soldes intermédiaires de gestion" description="Les principaux niveaux de résultat de votre entreprise, validés et publiés par votre DAF." />
      {!selected || !content ? (
        <Alert data-testid="client-sig-empty">Aucun SIG publié pour le moment. Ils apparaîtront ici dès que votre DAF les aura validés et publiés.</Alert>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">Publié le {fmtDateTime(selected.publishedAt)}</Badge>
            {content.source.provisional ? <Badge variant="warning">Données provisoires</Badge> : <Badge variant="outline">Données définitives</Badge>}
            <span className="text-muted-foreground">{content.period.label}</span>
          </div>
          {selected.obsolete ? (
            <Alert variant="warning" data-testid="client-sig-obsolete">Vos données comptables ont été mises à jour depuis cette publication : votre DAF prépare une nouvelle version.</Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.rows.filter((r) => ["CHIFFRE_AFFAIRES", "VALEUR_AJOUTEE", "EBE", "RESULTAT_NET"].includes(r.code)).map((r) => {
              const v = variationView(r.value, r.previous);
              return (
                <Card key={r.code} data-testid={`client-kpi-${r.code}`}>
                  <CardHeader className="pb-2"><CardDescription>{r.label}</CardDescription><CardTitle className="text-2xl tabular-nums">{euro(r.value)}</CardTitle></CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {v ? `${v.percent} par rapport à l'an dernier (${euro(r.previous!)})` : "Données N-1 indisponibles"}
                    {r.clientExplanation ? <p className="mt-2">{r.clientExplanation}</p> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardHeader><CardTitle>Détail des soldes</CardTitle></CardHeader>
            <CardContent><SigTable content={content} detail={false} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Comprendre ces soldes</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                {content.rows.filter((r) => r.clientExplanation).map((r) => (
                  <div key={r.code}><dt className="font-medium">{r.label}</dt><dd className="text-muted-foreground">{r.clientExplanation}</dd></div>
                ))}
              </dl>
              {content.checks.length ? (
                <ul className="mt-4 list-disc pl-5 text-xs text-muted-foreground">{content.checks.map((c) => <li key={c.code}>{c.title} : {c.explanation}</li>)}</ul>
              ) : null}
            </CardContent>
          </Card>
          {published.length > 1 ? (
            <Card>
              <CardHeader><CardTitle>Versions publiées</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {published.map((p) => (
                    <li key={p.id}>
                      <Link className="underline" href={`?version=${p.id}`}>{p.periodStart} → {p.periodEnd}</Link> — publiée le {fmtDateTime(p.publishedAt)}{p.obsolete ? " (mise à jour en cours)" : ""}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
