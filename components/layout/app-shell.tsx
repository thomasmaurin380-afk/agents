import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme";

export function AppShell({
  space,
  homeHref,
  sidebar,
  userName,
  userRoleLabel,
  children,
}: {
  space: "daf" | "client";
  homeHref: string;
  sidebar: React.ReactNode;
  userName: string;
  userRoleLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="border-b bg-sidebar md:sticky md:top-0 md:h-svh md:w-64 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Link href={homeHref} className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              DAF
            </span>
            <span className="text-sm">{space === "daf" ? "Cockpit DAF" : "Espace dirigeant"}</span>
          </Link>
          {/* Mobile : menu repliable, sans JavaScript (case à cocher + :checked). */}
          <label
            htmlFor="nav-toggle"
            className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm md:hidden"
          >
            <Menu className="size-4" aria-hidden /> Menu
          </label>
        </div>
        <input id="nav-toggle" type="checkbox" className="peer sr-only" aria-label="Afficher le menu" />
        <nav aria-label="Navigation principale" className="hidden px-2 pb-4 peer-checked:block md:block">
          {sidebar}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b bg-card/60 px-4 backdrop-blur md:px-6">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium" data-testid="current-user">{userName}</p>
            <p className="text-xs text-muted-foreground">{userRoleLabel}</p>
          </div>
          <ThemeToggle />
          <form action={signOutAction}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Se déconnecter">
              <LogOut />
            </Button>
          </form>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions}
    </div>
  );
}
