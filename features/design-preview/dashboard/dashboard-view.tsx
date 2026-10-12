"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { INTERFACE_MODE_LABELS } from "@/features/interface-mode/mode";
import { useInterfaceMode } from "@/features/interface-mode/provider";
import { AnalyseDashboard } from "./analyse-dashboard";
import { buildDashboardModel, isScope, type Scope } from "./model";
import { PilotageDashboard } from "./pilotage-dashboard";

/**
 * Tableau de bord de la maquette : un seul modèle de données, deux compositions. Le mode choisit
 * la composition ; le périmètre (entité) vit dans l'adresse et survit donc à la bascule, au
 * rechargement et au partage du lien.
 */
export function DashboardView({ firstName }: { firstName: string }) {
  const { mode } = useInterfaceMode();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = search.get("entite");
  const scope: Scope = isScope(raw) ? raw : "all";
  const model = useMemo(() => buildDashboardModel(scope), [scope]);

  const setScope = (next: Scope) => {
    const q = new URLSearchParams(search.toString());
    if (next === "all") q.delete("entite");
    else q.set("entite", next);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div data-dashboard data-mode={mode ?? "pending"} aria-busy={mode === null}>
      <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning-surface px-3 py-1 text-[12.5px] font-medium text-warning-text" data-testid="demo-banner">
        Maquette de conception · données fictives, non issues de l&apos;application
      </p>
      <p className="sr-only" aria-live="polite" data-testid="mode-announcement">
        {mode ? `Mode ${INTERFACE_MODE_LABELS[mode].label} affiché` : ""}
      </p>
      {mode === null ? (
        <DashboardSkeleton />
      ) : mode === "analyse" ? (
        <AnalyseDashboard model={model} firstName={firstName} onScopeChange={setScope} />
      ) : (
        <PilotageDashboard model={model} firstName={firstName} onScopeChange={setScope} />
      )}
    </div>
  );
}

/** Premier rendu (serveur) : la préférence locale n'est pas encore lue. Neutre, sans contenu inventé. */
function DashboardSkeleton() {
  return (
    <div aria-hidden className="animate-pulse space-y-5">
      <div className="h-10 w-72 rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-surface-2" />)}
      </div>
      <div className="h-72 rounded-xl bg-surface-2" />
    </div>
  );
}
