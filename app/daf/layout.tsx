import { AppShell } from "@/components/layout/app-shell";
import { DafSidebar } from "@/features/navigation/daf-sidebar";
import { HeaderContext } from "@/features/navigation/header-context";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { requireStaff } from "@/lib/guards";
import { SidebarFirmCard } from "@/features/navigation/sidebar-firm-card";
import { listPortfolio } from "@/services/companies";
import { DisplayPreferencesMenu, InterfaceModeOptions } from "@/features/interface-mode/controls";
import { InterfaceModeProvider } from "@/features/interface-mode/provider";

export default async function DafLayout({ children }: LayoutProps<"/daf">) {
  const actor = await requireStaff();
  const role = actor.firms.some((f) => f.role === "firm_admin") ? "firm_admin" : "firm_analyst";
  // Noms des entreprises accessibles (RLS) : entreprise active affichée dans l'en-tête.
  const companyNames = Object.fromEntries((await listPortfolio(actor)).map((c) => [c.id, c.tradeName ?? c.legalName]));
  // Mode d'interface : prototype, proposé seulement avec l'aperçu de conception (DESIGN_PREVIEW=1).
  const designPreview = process.env.DESIGN_PREVIEW === "1";
  const shell = (
    <AppShell
      space="daf"
      homeHref="/daf/portfolio"
      sidebar={<DafSidebar isAdmin={role === "firm_admin"} designPreview={designPreview} />}
      sidebarFooter={<SidebarFirmCard firmName={actor.firms[0]?.firmName ?? "Cabinet"} roleLabel={ROLE_LABELS[role]} />}
      context={<HeaderContext root={actor.firms[0]?.firmName ?? "Cabinet"} companyNames={companyNames} />}
      userName={actor.fullName}
      userRoleLabel={ROLE_LABELS[role]}
      preferences={designPreview ? <DisplayPreferencesMenu /> : undefined}
      mobilePreferences={designPreview ? <InterfaceModeOptions /> : undefined}
    >
      {children}
    </AppShell>
  );
  return designPreview ? <InterfaceModeProvider userId={actor.userId}>{shell}</InterfaceModeProvider> : shell;
}
