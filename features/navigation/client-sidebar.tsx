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
          className="mb-2 block rounded-md bg-warning/15 px-3 py-2 text-xs font-medium"
        >
          ← Retour au cockpit DAF (aperçu client)
        </Link>
      ) : null}
      {companies.length > 1 ? (
        <SidebarNav
          title="Mes entreprises"
          items={companies.map((c) => ({ label: c.name, href: `/client/${c.companyId}`, icon: "company" }))}
        />
      ) : null}
      {params.companyId ? <SidebarNav title="Mon espace" items={clientNav(params.companyId)} /> : null}
    </>
  );
}
