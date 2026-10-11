"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { clientNav } from "./nav";

export function ClientSidebar({
  companies,
  previewForStaff,
}: {
  companies: { companyId: string; name: string }[];
  previewForStaff: boolean;
}) {
  const params = useParams<{ companyId?: string }>();
  return (
    <>
      {previewForStaff && params.companyId ? (
        <Link
          href={`/daf/c/${params.companyId}`}
          className="mb-4 block rounded-lg border border-warning/30 bg-warning-surface px-3 py-2 text-[12.5px] font-medium text-warning-text hover:border-warning/50"
        >
          ← Retour au cockpit DAF (aperçu client)
        </Link>
      ) : null}
      {companies.length > 1 ? (
        <SidebarNav
          title="Mes entreprises"
          items={companies.map((c) => ({ label: c.name, href: `/client/${c.companyId}`, icon: "company" }))}
          exactHrefs={companies.map((c) => `/client/${c.companyId}`)}
        />
      ) : null}
      {params.companyId ? <SidebarNav title="Mon espace" items={clientNav(params.companyId)} exactHrefs={[`/client/${params.companyId}`]} /> : null}
    </>
  );
}
