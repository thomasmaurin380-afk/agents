"use client";

import { useParams } from "next/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { dafCompanyNav, dafGlobalNav, type NavItem } from "./nav";

export function DafSidebar({ isAdmin, designPreview = false }: { isAdmin: boolean; designPreview?: boolean }) {
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId;
  const global = dafGlobalNav(isAdmin);
  const settings = global.filter((i) => i.href === "/daf/team");
  const main: NavItem[] = [
    // Maquette visuelle du futur tableau de bord : uniquement si l'aperçu de conception est activé.
    ...(designPreview ? [{ label: "Tableau de bord", href: "/daf/maquette", icon: "dashboard" as const }] : []),
    ...global.filter((i) => i.href !== "/daf/team"),
  ];
  return (
    <>
      <SidebarNav items={main} />
      {companyId ? <SidebarNav title="Entreprise" items={dafCompanyNav(companyId)} exactHrefs={[`/daf/c/${companyId}`]} /> : null}
      {settings.length ? <SidebarNav title="Paramètres" items={settings} /> : null}
    </>
  );
}
