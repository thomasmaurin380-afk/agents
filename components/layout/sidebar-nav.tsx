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
    <div className="mb-5">
      {title ? <div className="px-3 pb-1.5 text-[12px] font-medium text-sidebar-muted">{title}</div> : null}
      <ul className="space-y-px">
        {available.map((item) => {
          const active = isActive(pathname, item.href!, exactHrefs.includes(item.href!));
          return (
            <li key={item.label}>
              <Link
                href={item.href!}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] text-sidebar-foreground transition-colors",
                  "hover:bg-sidebar-hover hover:text-foreground [&_svg]:text-sidebar-muted",
                  active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:text-sidebar-primary",
                )}
              >
                <NavIcon name={item.icon} />
                <span className="truncate">{item.label}</span>
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
            className="flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-[12.5px] text-sidebar-muted hover:bg-sidebar-hover"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
            Modules à venir <span className="num ml-auto text-[11px]">{planned.length}</span>
          </button>
          <ul id={plannedId} hidden={!open} className="mt-0.5 space-y-px">
            {planned.map((item) => (
              <li key={item.label} title={`Disponible en phase ${item.plannedPhase}`} className="flex h-8 cursor-not-allowed items-center gap-2.5 px-3 text-[12.5px] text-sidebar-muted/80">
                <NavIcon name={item.icon} />
                <span className="flex-1 truncate">{item.label}<span className="sr-only"> (disponible en phase {item.plannedPhase})</span></span>
                <span aria-hidden className="num text-[10.5px]">P{item.plannedPhase}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
