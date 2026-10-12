"use client";

import { BarChart3, Gauge } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, useTransition } from "react";
import type * as React from "react";
import {
  INTERFACE_MODE_COOKIE, INTERFACE_MODE_LABELS, INTERFACE_MODES, writeInterfaceMode, type InterfaceMode,
} from "@/lib/interface-mode";
import { cn } from "@/lib/utils";

type Ctx = { mode: InterfaceMode; setMode: (m: InterfaceMode) => void; pending: boolean };
export const InterfaceModeContext = createContext<Ctx | null>(null);

function readCookie(name: string) {
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * Fournit le mode d'interface à toute la coque et le reflète dans `data-ui-mode` (tokens CSS
 * propres à chaque mode). Le changement est immédiat côté client, puis le serveur recompose les
 * pages dont la structure dépend du mode (router.refresh : l'état des formulaires est conservé).
 */
export function InterfaceModeProvider({ userId, initialMode, className, children }: {
  userId: string;
  initialMode: InterfaceMode;
  className?: string;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState(initialMode);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const setMode = useCallback((m: InterfaceMode) => {
    setModeState(m);
    const value = writeInterfaceMode(readCookie(INTERFACE_MODE_COOKIE), userId, m);
    document.cookie = `${INTERFACE_MODE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }, [router, userId]);
  return (
    <InterfaceModeContext.Provider value={{ mode, setMode, pending }}>
      <div data-ui-mode={mode} className={className} aria-busy={pending || undefined}>{children}</div>
    </InterfaceModeContext.Provider>
  );
}

export function useInterfaceMode() {
  const ctx = useContext(InterfaceModeContext);
  if (!ctx) throw new Error("useInterfaceMode hors InterfaceModeProvider");
  return ctx;
}

const ICONS = { analyse: BarChart3, pilotage: Gauge } as const;

/** Sélecteur « Mode d'interface » : groupe de boutons radio, utilisable au clavier. */
export function InterfaceModeSwitch({ variant = "compact", className }: { variant?: "compact" | "detailed"; className?: string }) {
  const { mode, setMode } = useInterfaceMode();
  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = INTERFACE_MODES[(INTERFACE_MODES.indexOf(mode) + 1) % INTERFACE_MODES.length];
    setMode(next);
    (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
  };
  if (variant === "detailed") {
    return (
      <div role="radiogroup" aria-label="Mode d'interface" onKeyDown={onKey} className={cn("grid gap-2", className)}>
        {INTERFACE_MODES.map((m) => {
          const Icon = ICONS[m];
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-mode={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                active ? "border-primary/40 bg-accent" : "hover:bg-surface-2/60",
              )}
            >
              <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground")}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold text-foreground">{INTERFACE_MODE_LABELS[m].label}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{INTERFACE_MODE_LABELS[m].description}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label="Mode d'interface" onKeyDown={onKey} className={cn("inline-flex rounded-xl border bg-card p-1 shadow-card", className)} data-testid="interface-mode-switch">
      {INTERFACE_MODES.map((m) => {
        const Icon = ICONS[m];
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-mode={m}
            onClick={() => setMode(m)}
            className={cn(
              "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors",
              active ? "bg-primary text-primary-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {INTERFACE_MODE_LABELS[m].label}
          </button>
        );
      })}
    </div>
  );
}
