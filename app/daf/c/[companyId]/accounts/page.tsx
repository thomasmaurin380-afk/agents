import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapAccountForm } from "@/features/data/forms";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getChartOfAccounts } from "@/services/company-data";

export const metadata: Metadata = { title: "Plan de comptes" };

const STATUS = {
  auto_validated: { label: "Automatique validé", variant: "success" },
  manual: { label: "Manuel", variant: "secondary" },
  to_review: { label: "À vérifier", variant: "warning" },
} as const;

export default async function AccountsPage({ params, searchParams }: PageProps<"/daf/c/[companyId]/accounts">) {
  const { companyId } = await params;
  const { filtre } = await searchParams;
  const toReview = filtre === "a-verifier";
  const actor = await requireStaff();
  const d = await orNotFound(getChartOfAccounts(actor, companyId, toReview));
  const base = `/daf/c/${companyId}/accounts`;
  const total = (d.counts.auto_validated ?? 0) + (d.counts.manual ?? 0) + (d.counts.to_review ?? 0);
  return (
    <>
      <PageHeader
        title="Plan de comptes"
        description="Rattachement des comptes de l'entreprise au Plan comptable général, utilisé par le calcul des SIG (phase 3)."
        actions={<Link href={`/daf/c/${companyId}/data`} className={buttonVariants({ variant: "outline" })}>Retour aux données</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={base} className={buttonVariants({ variant: toReview ? "ghost" : "secondary", size: "sm" })}>Tous ({total})</Link>
        <Link href={`${base}?filtre=a-verifier`} className={buttonVariants({ variant: toReview ? "secondary" : "ghost", size: "sm" })}>
          À vérifier ({d.counts.to_review ?? 0})
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Comptes</CardTitle>
          <CardDescription>
            Comptes numériques rattachés automatiquement à leur racine PCG. Les comptes alphanumériques (ou de
            classe 0 / 9) doivent être rattachés manuellement ; une règle évite de le refaire pour les suivants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{toReview ? "Aucun compte à vérifier." : "Aucun compte : importez une balance ou un FEC."}</p>
          ) : (
            <Table data-testid="accounts-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Compte</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead>PCG</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Rattachement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono">{a.accountNumber}{a.isAuxiliary ? <span className="ml-1 text-xs text-muted-foreground">(auxiliaire)</span> : null}</TableCell>
                    <TableCell>{a.label || "—"}</TableCell>
                    <TableCell className="font-mono">{a.pcgAccount ?? "—"}</TableCell>
                    <TableCell><Badge variant={STATUS[a.mappingStatus].variant}>{STATUS[a.mappingStatus].label}</Badge></TableCell>
                    <TableCell>{a.mappingStatus === "to_review" ? <MapAccountForm companyId={companyId} accountNumber={a.accountNumber} /> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {d.rules.length > 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Règles mémorisées : {d.rules.map((r) => `${r.matchType === "prefix" ? `${r.pattern}…` : r.pattern} → ${r.pcgAccount}`).join(" · ")}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
