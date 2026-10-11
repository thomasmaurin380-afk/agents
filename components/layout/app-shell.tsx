import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme";

const SPACE_LABELS = { daf: "Cockpit DAF", client: "Espace dirigeant" } as const;

function initials(name: string) {
  return name.split(/\s+/).filter((p) => /^[\p{L}]/u.test(p)).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

/**
 * Coque des deux espaces : navigation bleu nuit (fixe sur ordinateur, repliable sur mobile,
 * sans JavaScript), en-tête clair (contexte, utilisateur, thème, déconnexion), contenu centré.
 */
export function AppShell({
  space,
  homeHref,
  sidebar,
  userName,
  userRoleLabel,
  contextLabel,
  children,
}: {
  space: "daf" | "client";
  homeHref: string;
  sidebar: React.ReactNode;
  userName: string;
  userRoleLabel: string;
  /** Contexte affiché dans l'en-tête (ex. nom du cabinet). */
  contextLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-svh md:w-64 md:shrink-0 md:flex-col md:border-r md:border-sidebar-border">
        <div className="flex h-16 items-center justify-between gap-2 px-4 md:px-5">
          <Link href={homeHref} className="flex min-w-0 items-center gap-3 rounded-md text-white">
            <BrandMark />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold">Plateforme DAF</span>
              <span className="block truncate text-xs text-sidebar-muted">{SPACE_LABELS[space]}</span>
            </span>
          </Link>
          {/* Mobile : menu repliable, sans JavaScript (case à cocher + :checked). */}
          <label
            htmlFor="nav-toggle"
            className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-sidebar-border px-3 text-sm text-white hover:bg-sidebar-accent md:hidden"
          >
            <Menu className="size-4" aria-hidden /> Menu
          </label>
        </div>
        <input id="nav-toggle" type="checkbox" className="peer sr-only" aria-label="Afficher le menu" />
        <nav
          aria-label="Navigation principale"
          className="hidden border-t border-sidebar-border px-3 pb-6 pt-3 peer-checked:block peer-focus-visible:block md:block md:flex-1 md:overflow-y-auto"
        >
          {sidebar}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-end gap-3 border-b bg-card/85 md:justify-between px-4 backdrop-blur supports-[backdrop-filter]:bg-card/75 md:px-8">
          <p className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">
            <span className="font-medium text-foreground">{SPACE_LABELS[space]}</span>
            {contextLabel ? <span className="hidden sm:inline"> · {contextLabel}</span> : null}
          </p>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="mr-1 flex items-center gap-2.5">
              <span aria-hidden className="hidden size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground sm:grid">
                {initials(userName)}
              </span>
              <div className="text-right leading-tight sm:text-left">
                <p className="max-w-40 truncate text-sm font-medium" data-testid="current-user">{userName}</p>
                <p className="max-w-40 truncate text-xs text-muted-foreground">{userRoleLabel}</p>
              </div>
            </div>
            <ThemeToggle />
            <form action={signOutAction}>
              <Button variant="ghost" size="icon" type="submit" aria-label="Se déconnecter" title="Se déconnecter">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

/** En-tête de page : titre sobre, sous-titre discret, actions alignées à droite. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-tight">{title}</h1>
        {description ? <div className="mt-1.5 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Titre de section à l'intérieur d'une page. */
export function SectionTitle({ children, description, actions }: { children: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{children}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
