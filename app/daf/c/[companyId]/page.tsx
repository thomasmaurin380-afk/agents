import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fiscalYearLabel } from "@/domain/company/fiscal-year";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { COMPANY_STATUS_LABELS, COMPANY_STATUS_VARIANTS } from "@/features/companies/labels";
import { IndicatorGrid } from "@/features/companies/indicator-grid";
import { AdvisorToggle, InviteClientForm, RevokeInvitationButton } from "@/features/companies/members-panel";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getCompanyWorkspace } from "@/services/companies";

export const metadata: Metadata = { title: "Fiche entreprise" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function CompanyPage({ params }: PageProps<"/daf/c/[companyId]">) {
  const { companyId } = await params;
  const actor = await requireStaff();
  const ws = await orNotFound(getCompanyWorkspace(actor, companyId));
  const c = ws.company;
  const isAdmin = ws.role === "firm_admin";
  const assigned = new Set(ws.advisors.map((a) => a.userId));

  const identity = [
    ["Raison sociale", c.legalName],
    ["Nom commercial", c.tradeName],
    ["SIREN", c.siren],
    ["Forme juridique", c.legalForm],
    ["Code NAF", c.nafCode],
    ["Secteur", c.sector],
    ["Exercice", fiscalYearLabel(c.fiscalYearStartMonth)],
    ["Devise", c.currency],
    ["DAF référent", ws.leadAdvisorName],
  ] as const;

  return (
    <>
      <PageHeader
        title={c.tradeName ?? c.legalName}
        description={
          <span className="flex items-center gap-2">
            <Badge variant={COMPANY_STATUS_VARIANTS[c.status]}>{COMPANY_STATUS_LABELS[c.status]}</Badge>
            Votre rôle : {ROLE_LABELS[ws.role]}
          </span>
        }
        actions={
          isAdmin ? (
            <Link href={`/daf/c/${c.id}/edit`} className={buttonVariants({ variant: "outline" })}>
              <Pencil /> Modifier
            </Link>
          ) : null
        }
      />

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Indicateurs clés
        </h2>
        <IndicatorGrid available={new Set()} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
              {identity.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd>{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Équipe DAF affectée</CardTitle>
            <CardDescription>Seuls les collaborateurs affectés accèdent à ce dossier.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {(isAdmin ? ws.staff : ws.advisors).map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell>
                      <p className="font-medium">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin ? (
                        "role" in s && s.role === "firm_admin" ? (
                          <Badge variant="secondary">Administrateur (accès complet)</Badge>
                        ) : (
                          <AdvisorToggle
                            companyId={c.id}
                            userId={s.userId}
                            assigned={assigned.has(s.userId)}
                            isLead={c.leadAdvisorId === s.userId}
                          />
                        )
                      ) : c.leadAdvisorId === s.userId ? (
                        <Badge>Référent</Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Accès client</CardTitle>
            <CardDescription>
              Dirigeants et collaborateurs ayant accès au portail de l&apos;entreprise.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Table data-testid="client-members">
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ws.clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      Aucun accès client pour le moment.
                    </TableCell>
                  </TableRow>
                ) : (
                  ws.clients.map((m) => (
                    <TableRow key={m.userId}>
                      <TableCell>
                        <p className="font-medium">{m.fullName}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </TableCell>
                      <TableCell>{ROLE_LABELS[m.role]}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {isAdmin ? (
              <>
                <InviteClientForm companyId={c.id} />
                {ws.invitations.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invitation en attente</TableHead>
                        <TableHead>Rôle</TableHead>
                        <TableHead>Expire le</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ws.invitations.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>{i.email}</TableCell>
                          <TableCell>{ROLE_LABELS[i.role]}</TableCell>
                          <TableCell>
                            {i.expiresAt < new Date() ? (
                              <Badge variant="outline">Expirée</Badge>
                            ) : (
                              dateFmt.format(i.expiresAt)
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <RevokeInvitationButton companyId={c.id} invitationId={i.id} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
