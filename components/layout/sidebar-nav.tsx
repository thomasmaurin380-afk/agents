"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/features/navigation/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

export function SidebarNav({ title, items }: { title?: string; items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="space-y-1">
      {title ? (
        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {items.map((item) =>
          item.href ? (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                  pathname === item.href && "bg-sidebar-accent font-medium text-foreground",
                )}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            </li>
          ) : (
            <li
              key={item.label}
              title={`Disponible en phase ${item.plannedPhase}`}
              className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground/60"
            >
              <NavIcon name={item.icon} />
              <span className="flex-1">{item.label}</span>
              <span className="rounded border px-1 text-[10px]">P{item.plannedPhase}</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
