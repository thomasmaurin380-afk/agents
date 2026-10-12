import { CalendarDays } from "lucide-react";
import { useEffect } from "react";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { getDemoDashboard } from "@/features/design-preview/demo-data";
import { AnalyseDashboard, StaticSelect } from "@/features/dashboards/analyse-dashboard";
import { PilotageDashboard } from "@/features/dashboards/pilotage-dashboard";
import { SidebarFirmCard } from "@/features/navigation/sidebar-firm-card";
import { InterfaceModeSwitch, useInterfaceMode } from "@/components/layout/interface-mode";
import { DemoNav } from "./demo-nav";
import { readStoredMode } from "./interface-mode-demo";

/** Données fictives de la maquette V4 (source unique, aucune donnée réelle). */
const data = getDemoDashboard();
const USER = { name: "Camille Martin (démo)", role: "Administrateur DAF", firm: "Cabinet DAF Démo" };

/** Contenu du tableau de bord : même composition que /daf/maquette (V4 B). */
function Dashboard() {
  const { mode } = useInterfaceMode();
  return (
    <>
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning-surface px-3 py-1 text-[12.5px] font-medium text-warning-text" data-testid="demo-banner">
        Démonstration — données fictives
      </p>
      <PageHeader
        title="Bonjour Camille,"
        description={mode === "analyse"
          ? "Vue consolidée de la situation financière de votre entreprise."
          : "Voici la situation financière de votre entreprise aujourd'hui."}
        actions={
          <>
            <InterfaceModeSwitch />
            {mode === "analyse" ? (
              <>
                <StaticSelect><span className="flex items-center gap-2.5"><CalendarDays className="size-4 text-muted-foreground" aria-hidden />{data.period.label}</span></StaticSelect>
                <StaticSelect>Toutes les entités</StaticSelect>
              </>
            ) : (
              <StaticSelect><span className="flex items-center gap-2.5"><CalendarDays className="size-4 text-muted-foreground" aria-hidden />{data.period.range}</span></StaticSelect>
            )}
          </>
        }
      />
      {mode === "analyse" ? <AnalyseDashboard data={data} /> : <PilotageDashboard data={data} />}
    </>
  );
}

/** Aucune authentification : les boutons « Se déconnecter » de la coque sont désactivés. */
function useDisableSignOut() {
  useEffect(() => {
    document.querySelectorAll<HTMLButtonElement>('button[aria-label="Se déconnecter"]').forEach((b) => {
      b.disabled = true;
      b.title = "Non disponible dans la démonstration";
      b.classList.add("cursor-not-allowed", "opacity-40");
    });
  }, []);
}

export function App() {
  useDisableSignOut();
  return (
    <AppShell
      space="daf"
      homeHref="./"
      sidebar={<DemoNav />}
      sidebarFooter={<SidebarFirmCard firmName={USER.firm} roleLabel={USER.role} />}
      context={<p className="text-[13.5px] text-muted-foreground">{USER.firm}</p>}
      userId="demo"
      interfaceMode={readStoredMode()}
      userName={USER.name}
      userRoleLabel={USER.role}
    >
      <Dashboard />
    </AppShell>
  );
}
