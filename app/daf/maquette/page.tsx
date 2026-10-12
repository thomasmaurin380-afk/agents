import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DashboardView } from "@/features/design-preview/dashboard/dashboard-view";
import { requireStaff } from "@/lib/guards";

export const metadata: Metadata = { title: "Maquette du tableau de bord" };

/**
 * MAQUETTE DE CONCEPTION V4 : tableau de bord en deux modes d'interface (Analyse, Pilotage).
 * La phase 4 n'est pas développée. La page n'est accessible qu'avec DESIGN_PREVIEW=1 (jamais en
 * production) et au personnel du cabinet. Toutes les valeurs sont fictives
 * (features/design-preview/dashboard/data.ts).
 */
export default async function DashboardMockupPage() {
  if (process.env.DESIGN_PREVIEW !== "1") notFound();
  const actor = await requireStaff();
  const firstName = actor.fullName.split(/\s+/)[0];
  return (
    <Suspense>
      <DashboardView firstName={firstName} />
    </Suspense>
  );
}
