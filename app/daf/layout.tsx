import { AppShell } from "@/components/layout/app-shell";
import { DafSidebar } from "@/features/navigation/daf-sidebar";
import { HeaderContext } from "@/features/navigation/header-context";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { requireStaff } from "@/lib/guards";
import { SidebarFirmCard } from "@/features/navigation/sidebar-firm-card";
import { listPortfolio } from "@/services/companies";

export default async function DafLayout({ children }: LayoutProps<"/daf">) {
  const actor = await requireStaff();
  const role = actor.firms.some((f) => f.role === "firm_admin") ? "firm_admin" : "firm_analyst";
  // Noms des entreprises accessibles (RLS) : entreprise active affichée dans l'en-tête.
  const companyNames = Object.fromEntries((await listPortfolio(actor)).map((c) => [c.id, c.tradeName ?? c.legalName]));
  return (
    <AppShell
      space="daf"
      homeHref="/daf/portfolio"
      sidebar={<DafSidebar isAdmin={role === "firm_admin"} designPreview={process.env.DESIGN_PREVIEW === "1"} />}
      sidebarFooter={<SidebarFirmCard firmName={actor.firms[0]?.firmName ?? "Cabinet"} roleLabel={ROLE_LABELS[role]} />}
      context={<HeaderContext root={actor.firms[0]?.firmName ?? "Cabinet"} companyNames={companyNames} />}
      userName={actor.fullName}
      userRoleLabel={ROLE_LABELS[role]}
    >
      {children}
    </AppShell>
  );
}
