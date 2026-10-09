import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { InviteStaffForm } from "@/features/team/invite-staff-form";
import { orNotFound, requireStaff } from "@/lib/guards";
import { listAssignableStaff } from "@/services/companies";

export const metadata: Metadata = { title: "Équipe du cabinet" };

export default async function TeamPage() {
  const actor = await requireStaff();
  const staff = await orNotFound(listAssignableStaff(actor));
  return (
    <>
      <PageHeader title="Équipe du cabinet" description="Collaborateurs DAF et leurs rôles." />
      <div className="grid gap-6">
        <Card>
          <CardContent className="pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collaborateur</TableHead>
                  <TableHead>Rôle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell>
                      <p className="font-medium">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[s.role]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inviter un collaborateur</CardTitle>
            <CardDescription>
              Un collaborateur DAF n&apos;accède qu&apos;aux entreprises auxquelles il est affecté. La double
              authentification lui sera demandée à la première connexion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteStaffForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
