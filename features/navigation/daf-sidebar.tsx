"use client";

import { useParams } from "next/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { dafCompanyNav, dafGlobalNav } from "./nav";

export function DafSidebar({ isAdmin }: { isAdmin: boolean }) {
  const params = useParams<{ companyId?: string }>();
  return (
    <>
      <SidebarNav items={dafGlobalNav(isAdmin)} />
      {params.companyId ? <SidebarNav title="Entreprise" items={dafCompanyNav(params.companyId)} /> : null}
    </>
  );
}
