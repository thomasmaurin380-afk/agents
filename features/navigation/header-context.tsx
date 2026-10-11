"use client";

import { Building2, ChevronRight } from "lucide-react";
import { useParams } from "next/navigation";

/** Contexte de l'en-tête : cabinet (ou espace) puis entreprise active, bien visible. */
export function HeaderContext({ root, companyNames }: { root: string; companyNames: Record<string, string> }) {
  const { companyId } = useParams<{ companyId?: string }>();
  const company = companyId ? companyNames[companyId] : undefined;
  return (
    <p className="flex min-w-0 items-center gap-2 text-[13.5px]">
      <span className="truncate text-muted-foreground">{root}</span>
      {company ? (
        <>
          <ChevronRight className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
          <span className="flex min-w-0 items-center gap-2 font-medium text-foreground" data-testid="active-company">
            <Building2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <span className="truncate">{company}</span>
          </span>
        </>
      ) : null}
    </p>
  );
}
