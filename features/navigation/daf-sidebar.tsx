"use client";

import { useParams } from "next/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { dafCompanyNav, dafGlobalNav } from "./nav";

export function DafSidebar({ isAdmin, companyNames }: { isAdmin: boolean; companyNames: Record<string, string> }) {
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId;
  return (
    <>
      <SidebarNav title="Cabinet" items={dafGlobalNav(isAdmin)} />
      {companyId ? (
        <SidebarNav
          title={
            <span className="block normal-case tracking-normal">
              <span className="block text-[11px] uppercase tracking-[0.08em]">Entreprise active</span>
              <span className="mt-1 block truncate text-sm font-semibold text-white" data-testid="active-company">{companyNames[companyId] ?? "—"}</span>
            </span>
          }
          items={dafCompanyNav(companyId)}
          exactHrefs={[`/daf/c/${companyId}`]}
        />
      ) : null}
    </>
  );
}
