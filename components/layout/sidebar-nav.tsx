"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import type { NavItem } from "@/features/navigation/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

/** Lien actif : la page elle-même ou l'une de ses sous-pages (sauf pour la racine d'un espace). */
function isActive(pathname: string, href: string, exact: boolean) {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}

export function SidebarNav({ title, items, exactHrefs = [] }: { title?: React.ReactNode; items: NavItem[]; exactHrefs?: string[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-4">
      {title ? <div className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">{title}</div> : null}
      <ul className="space-y-0.5">
        {items.map((item) => {
          if (!item.href) {
            return (
              <li
                key={item.label}
                title={`Disponible en phase ${item.plannedPhase}`}
                className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40"
              >
                <NavIcon name={item.icon} />
                <span className="flex-1 truncate">{item.label}<span className="sr-only"> (disponible en phase {item.plannedPhase})</span></span>
                <span className="rounded border border-sidebar-border px-1 text-[10px] text-sidebar-muted">P{item.plannedPhase}</span>
              </li>
            );
          }
          const active = isActive(pathname, item.href, exactHrefs.includes(item.href));
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors",
                  "hover:bg-sidebar-accent hover:text-white focus-visible:outline-sidebar-primary",
                  active && "bg-sidebar-accent font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-primary before:content-['']",
                )}
              >
                <NavIcon name={item.icon} />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
