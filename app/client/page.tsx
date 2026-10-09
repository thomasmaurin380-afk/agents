import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActor } from "@/lib/guards";
import { isStaff } from "@/services/actor";

export default async function ClientIndex() {
  const actor = await requireActor();
  if (actor.clientCompanies.length === 0) redirect(isStaff(actor) ? "/daf/portfolio" : "/no-access");
  if (actor.clientCompanies.length === 1) redirect(`/client/${actor.clientCompanies[0].companyId}`);
  return (
    <>
      <PageHeader title="Mes entreprises" />
      <div className="grid gap-4 sm:grid-cols-2">
        {actor.clientCompanies.map((c) => (
          <Link key={c.companyId} href={`/client/${c.companyId}`}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle>{c.tradeName ?? c.companyName}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
