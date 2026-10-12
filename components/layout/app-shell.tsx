import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import type { InterfaceMode } from "@/lib/interface-mode";
import { signOutAction } from "@/app/(auth)/actions";
import { BrandLockup } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { InterfaceModeProvider, InterfaceModeSwitch } from "./interface-mode";
import { NavDrawerController } from "./nav-drawer";
import { ProfileMenu } from "./profile-menu";
import { ThemeToggle } from "./theme";

const SPACE_LABELS = { daf: "Cockpit DAF", client: "Espace dirigeant" } as const;

function initials(name: string) {
  return name.split(/\s+/).filter((p) => /^[\p{L}]/u.test(p)).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

/**
 * Coque des deux espaces : navigation claire et fine (fixe sur ordinateur, tiroir sur mobile,
 * sans JavaScript), en-tête discret (contexte, utilisateur), contenu centré.
 */
export function AppShell({
  space,
  homeHref,
  sidebar,
  userId,
  interfaceMode,
  userName,
  userRoleLabel,
  context,
  sidebarFooter,
  children,
}: {
  space: "daf" | "client";
  homeHref: string;
  sidebar: React.ReactNode;
  /** Utilisateur connecté : la préférence d'affichage lui est propre. */
  userId: string;
  interfaceMode: InterfaceMode;
  userName: string;
  userRoleLabel: string;
  /** Contexte affiché dans l'en-tête (cabinet, entreprise active). */
  context?: React.ReactNode;
  /** Pied de la navigation (ordinateur) : informations existantes uniquement. */
  sidebarFooter?: React.ReactNode;

  children: React.ReactNode;
}) {
  return (
    <InterfaceModeProvider userId={userId} initialMode={interfaceMode} className="min-h-svh bg-background md:grid md:grid-cols-[264px_minmax(0,1fr)] md:gap-4 md:p-4">
      {/* Mobile : tiroir de navigation sans JavaScript (case à cocher + :checked). */}
      <input id="nav-toggle" type="checkbox" className="peer sr-only md:hidden" aria-label="Menu de navigation" aria-controls="app-nav" />
      <NavDrawerController />
      <aside
        id="app-nav"
        className="fixed inset-x-0 bottom-0 top-16 z-30 hidden flex-col overflow-y-auto border-t bg-sidebar text-sidebar-foreground shadow-raised peer-checked:flex md:sticky md:top-4 md:flex md:h-[calc(100svh-2rem)] md:rounded-[var(--radius-shell)] md:border md:border-sidebar-border md:shadow-card"
      >
        <div className="hidden h-[84px] shrink-0 items-center px-6 md:flex">
          <Link href={homeHref} className="rounded-md">
            <BrandLockup />
          </Link>
        </div>
        <nav aria-label="Navigation principale" className="flex-1 px-4 pb-6 pt-4 md:overflow-y-auto md:pt-3">
          {sidebar}
        </nav>
        {sidebarFooter ? <div className="hidden px-4 pb-5 md:block">{sidebarFooter}</div> : null}
        {/* Mobile : préférences et déconnexion regroupées dans le tiroir. */}
        <div className="border-t px-5 py-4 md:hidden">
          <p className="mb-2.5 text-[12.5px] font-semibold text-foreground">Mode d&apos;interface</p>
          <InterfaceModeSwitch variant="detailed" />
        </div>
        <div className="mt-auto flex items-center gap-3 border-t bg-background/60 px-5 py-4 md:hidden">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent font-display text-[11px] font-bold text-accent-foreground">
            {initials(userName)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium text-foreground">{userName}</p>
            <p className="truncate text-[12px] text-muted-foreground">{userRoleLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button variant="ghost" size="icon" type="submit" aria-label="Se déconnecter" title="Se déconnecter">
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col peer-focus-visible:[&_label[for=nav-toggle]]:ring-2 peer-focus-visible:[&_label[for=nav-toggle]]:ring-ring peer-checked:[&_[data-menu=closed]]:hidden peer-checked:[&_[data-menu=open]]:inline-flex">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur-md sm:px-6 md:top-4 md:h-[72px] md:rounded-[var(--radius-shell)] md:border md:shadow-card lg:px-6">
          <Link href={homeHref} className="mr-auto rounded-md md:hidden">
            <BrandLockup subtitle={SPACE_LABELS[space]} />
          </Link>
          <div className="mr-auto hidden min-w-0 md:block">{context}</div>
          <div className="hidden md:block">
            <ProfileMenu userName={userName} userRoleLabel={userRoleLabel} initials={initials(userName)} />
          </div>
          <form action={signOutAction} className="hidden md:block">
            <Button variant="ghost" size="icon" type="submit" aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut />
            </Button>
          </form>
          <label
            htmlFor="nav-toggle"
            className="flex h-9 cursor-pointer items-center rounded-lg border bg-card px-3 text-[13px] font-medium md:hidden"
          >
            <span data-menu="closed" className="inline-flex items-center gap-2"><Menu className="size-4" aria-hidden /> Menu</span>
            <span data-menu="open" className="hidden items-center gap-2"><X className="size-4" aria-hidden /> Fermer</span>
          </label>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-7 sm:px-6 md:px-2 md:pb-4 md:pt-7">{children}</main>
      </div>
    </InterfaceModeProvider>
  );
}

/** En-tête de page : salutation ou surtitre, grand titre, description, actions. */
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
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1.5 text-[15px] text-muted-foreground sm:text-[17px]">{eyebrow}</p> : null}
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.015em] sm:text-[38px]">{title}</h1>
        {description ? <div className="mt-2 text-[14.5px] text-muted-foreground sm:text-[16px]">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end [&>*]:whitespace-nowrap">{actions}</div> : null}
    </div>
  );
}

/** Titre de section à l'intérieur d'une page. */
export function SectionTitle({ children, description, actions }: { children: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[19px] font-semibold tracking-[-0.015em]">{children}</h2>
        {description ? <p className="mt-1 text-[13.5px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
