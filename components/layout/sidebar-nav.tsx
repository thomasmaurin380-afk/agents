"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import type * as React from "react";
import type { NavItem } from "@/features/navigation/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

/** Lien actif : la page elle-même ou l'une de ses sous-pages (sauf pour les racines indiquées). */
function isActive(pathname: string, href: string, exact: boolean) {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}

/**
 * Groupe de navigation. Les modules disponibles sont listés ; les modules prévus dans une phase
 * ultérieure sont regroupés, repliés, sous « Modules à venir » (non cliquables).
 */
export function SidebarNav({ title, items, exactHrefs = [] }: { title?: React.ReactNode; items: NavItem[]; exactHrefs?: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const plannedId = useId();
  const available = items.filter((i) => i.href);
  const planned = items.filter((i) => !i.href);
  return (
    <div className="mb-4 border-b border-sidebar-border pb-4 last:border-b-0">
      {title ? <div className="px-3 pb-2 pt-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">{title}</div> : null}
      <ul className="space-y-1">
        {available.map((item) => {
          const active = isActive(pathname, item.href!, exactHrefs.includes(item.href!));
          return (
            <li key={item.label}>
              <Link
                href={item.href!}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] text-sidebar-foreground transition-colors",
                  "hover:bg-sidebar-hover hover:text-foreground [&_svg]:text-sidebar-muted",
                  active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:text-sidebar-primary",
                )}
              >
                <NavIcon name={item.icon} />
                <span className="truncate">{item.label}</span>
                {item.tag ? <span className="ml-auto shrink-0 rounded border border-warning/40 bg-warning-surface px-1 text-[10px] font-medium leading-4 text-warning-text">{item.tag}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {planned.length ? (
        <div className="mt-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={plannedId}
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-full items-center gap-2 rounded-xl px-3.5 text-left text-[13px] text-sidebar-muted hover:bg-sidebar-hover"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
            Modules à venir
          </button>
          <ul id={plannedId} hidden={!open} className="mt-0.5 space-y-px">
            {planned.map((item) => (
              <li key={item.label} className="flex h-9 cursor-default items-center gap-3 px-3.5 text-[13px] text-sidebar-muted">
                <NavIcon name={item.icon} />
                <span className="flex-1 truncate">{item.label}</span>
                <span className="shrink-0 text-[11px]">Phase {item.plannedPhase}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
