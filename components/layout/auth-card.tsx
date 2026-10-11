import { LockKeyhole, ShieldCheck } from "lucide-react";
import type * as React from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "./theme";

/**
 * Pages d'authentification (connexion, invitation, double authentification) : panneau de
 * marque bleu nuit sur grand écran, formulaire sur surface claire.
 */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-royal/25 blur-3xl" />
        <div className="relative flex items-center gap-3 text-white">
          <BrandMark />
          <span className="text-sm font-semibold">Plateforme DAF</span>
        </div>
        <div className="relative max-w-sm space-y-4">
          <p className="text-[1.65rem] font-semibold leading-tight tracking-tight text-white">
            Le pilotage financier de vos entreprises, en toute clarté.
          </p>
          <p className="text-sm leading-relaxed text-sidebar-foreground">
            Données comptables contrôlées, soldes intermédiaires de gestion justifiés, publications validées par votre DAF.
          </p>
        </div>
        <ul className="relative space-y-2 text-sm text-sidebar-foreground">
          <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-sidebar-primary" aria-hidden /> Double authentification pour le cabinet</li>
          <li className="flex items-center gap-2"><LockKeyhole className="size-4 text-sidebar-primary" aria-hidden /> Accès cloisonné par entreprise</li>
        </ul>
      </aside>
      <div className="relative flex flex-col items-center justify-center px-4 py-12 sm:px-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="text-sm font-semibold">Plateforme DAF</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</div> : null}
          {children ? <div className="mt-8 rounded-xl border bg-card p-6 shadow-card sm:p-7">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
