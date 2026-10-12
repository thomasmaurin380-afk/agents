import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { InterfaceModeSwitch } from "@/components/layout/interface-mode";
import { getDemoDashboard } from "@/features/design-preview/demo-data";
import { AnalyseDashboard, StaticSelect } from "@/features/dashboards/analyse-dashboard";
import { PilotageDashboard } from "@/features/dashboards/pilotage-dashboard";
import { requireStaff } from "@/lib/guards";
import { getInterfaceMode } from "@/lib/interface-mode-server";

export const metadata: Metadata = { title: "Maquette du tableau de bord" };

/**
 * MAQUETTE DE CONCEPTION — tableau de bord financier d'une entreprise (Phase 4 non développée).
 * Accessible uniquement si DESIGN_PREVIEW=1 (jamais en production) et au personnel du cabinet.
 * Deux compositions complètes selon le mode d'interface de l'utilisateur ; une seule source de
 * données (getDemoDashboard), entièrement fictive.
 */
export default async function DashboardMockupPage() {
  if (process.env.DESIGN_PREVIEW !== "1") notFound();
  const actor = await requireStaff();
  const mode = await getInterfaceMode(actor.userId);
  const data = getDemoDashboard();
  const firstName = actor.fullName.split(/\s+/)[0];

  return (
    <>
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning-surface px-3 py-1 text-[12.5px] font-medium text-warning-text" data-testid="demo-banner">
        Maquette de conception · données fictives, non issues de l&apos;application
      </p>
      <PageHeader
        title={`Bonjour ${firstName},`}
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
