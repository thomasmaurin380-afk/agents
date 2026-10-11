import { AppShell } from "@/components/layout/app-shell";
import { DafSidebar } from "@/features/navigation/daf-sidebar";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { requireStaff } from "@/lib/guards";
import { listPortfolio } from "@/services/companies";

export default async function DafLayout({ children }: LayoutProps<"/daf">) {
  const actor = await requireStaff();
  const role = actor.firms.some((f) => f.role === "firm_admin") ? "firm_admin" : "firm_analyst";
  // Noms des entreprises accessibles (RLS) : indication de l'entreprise active dans la navigation.
  const companyNames = Object.fromEntries((await listPortfolio(actor)).map((c) => [c.id, c.tradeName ?? c.legalName]));
  return (
    <AppShell
      space="daf"
      homeHref="/daf/portfolio"
      sidebar={<DafSidebar isAdmin={role === "firm_admin"} companyNames={companyNames} />}
      contextLabel={actor.firms[0]?.firmName}
      userName={actor.fullName}
      userRoleLabel={ROLE_LABELS[role]}
    >
      {children}
    </AppShell>
  );
}
