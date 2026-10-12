import type * as React from "react";
import { NavIcon } from "@/components/layout/nav-icon";
import type { NavItem } from "@/features/navigation/nav";
import { cn } from "@/lib/utils";

const ITEM = "flex h-[var(--nav-item-h)] items-center gap-3 rounded-xl px-3.5 text-[length:var(--nav-font)]";

/**
 * Navigation de la démonstration, avec les classes de SidebarNav : seul le tableau de bord est
 * disponible ; les autres modules de l'application sont affichés désactivés (hors démonstration).
 */
function Group({ title, items }: { title?: React.ReactNode; items: (NavItem & { current?: boolean })[] }) {
  return (
    <div className="mb-4 border-b border-sidebar-border pb-4 last:border-b-0">
      {title ? <div className="px-3 pb-2 pt-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">{title}</div> : null}
      <ul className="space-y-1">
        {items.map((item) =>
          item.current ? (
            <li key={item.label}>
              <a href="./" aria-current="page" className={cn(ITEM, "bg-sidebar-accent font-medium text-sidebar-accent-foreground [&_svg]:text-sidebar-primary")}>
                <NavIcon name={item.icon} />
                <span className="truncate">{item.label}</span>
              </a>
            </li>
          ) : (
            <li key={item.label}>
              <a role="link" aria-disabled="true" title="Non inclus dans la démonstration"
                className={cn(ITEM, "cursor-not-allowed text-sidebar-muted opacity-70 [&_svg]:text-sidebar-muted")}>
                <NavIcon name={item.icon} />
                <span className="truncate">{item.label}</span>
                <span className="sr-only">(non inclus dans la démonstration)</span>
              </a>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export function DemoNav() {
  return (
    <>
      <Group items={[
        { label: "Tableau de bord", icon: "dashboard", current: true },
        { label: "Portefeuille clients", icon: "portfolio" },
        { label: "Référentiel SIG", icon: "settings" },
      ]} />
      <Group title="Paramètres" items={[{ label: "Équipe du cabinet", icon: "team" }]} />
    </>
  );
}
