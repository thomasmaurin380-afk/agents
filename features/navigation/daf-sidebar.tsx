"use client";

import { useParams } from "next/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { dafCompanyNav, dafGlobalNav } from "./nav";

export function DafSidebar({ isAdmin }: { isAdmin: boolean }) {
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId;
  return (
    <>
      <SidebarNav title="Cabinet" items={dafGlobalNav(isAdmin)} />
      {companyId ? <SidebarNav title="Entreprise" items={dafCompanyNav(companyId)} exactHrefs={[`/daf/c/${companyId}`]} /> : null}
    </>
  );
}
