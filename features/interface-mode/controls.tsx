"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { INTERFACE_MODE_LABELS, INTERFACE_MODES, type InterfaceMode } from "./mode";
import { useInterfaceMode } from "./provider";

/** Déplacement au clavier dans un groupe radio (flèches, Début, Fin). */
function nextByKey(key: string, current: InterfaceMode): InterfaceMode | null {
  const i = INTERFACE_MODES.indexOf(current);
  const n = INTERFACE_MODES.length;
  if (key === "ArrowRight" || key === "ArrowDown") return INTERFACE_MODES[(i + 1) % n];
  if (key === "ArrowLeft" || key === "ArrowUp") return INTERFACE_MODES[(i - 1 + n) % n];
  if (key === "Home") return INTERFACE_MODES[0];
  if (key === "End") return INTERFACE_MODES[n - 1];
  return null;
}

/**
 * Choix détaillé du mode (préférences d'affichage) : groupe radio avec description.
 * Utilisé dans le menu du profil (ordinateur) et dans le tiroir de navigation (mobile).
 */
export function InterfaceModeOptions({ onChanged }: { onChanged?: () => void }) {
  const { mode, setMode } = useInterfaceMode();
  const labelId = useId();
  const refs = useRef<Partial<Record<InterfaceMode, HTMLButtonElement | null>>>({});
  const current = mode ?? "analyse";
  const choose = (m: InterfaceMode, focus = false) => {
    if (setMode(m)) onChanged?.();
    if (focus) refs.current[m]?.focus();
  };
  return (
    <div>
      <p id={labelId} className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Mode d&apos;interface</p>
      <div role="radiogroup" aria-labelledby={labelId} className="space-y-1.5">
        {INTERFACE_MODES.map((m) => {
          const checked = current === m;
          return (
            <button
              key={m}
              ref={(el) => {
                refs.current[m] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={mode === null}
              onClick={() => choose(m)}
              onKeyDown={(e) => {
                const n = nextByKey(e.key, m);
                if (n) {
                  e.preventDefault();
                  choose(n, true);
                }
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                checked ? "border-primary/50 bg-accent" : "border-border bg-card hover:bg-surface-2/70",
              )}
            >
              <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                {checked ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium text-foreground">{INTERFACE_MODE_LABELS[m].label}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{INTERFACE_MODE_LABELS[m].description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug text-muted-foreground">Préférence personnelle, enregistrée sur cet appareil. Les données et les droits restent identiques.</p>
    </div>
  );
}

/** Menu « Préférences d'affichage » à côté du profil (en-tête, ordinateur). */
export function DisplayPreferencesMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLElement>("[role=radio][tabindex='0']")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Préférences d'affichage"
        title="Préférences d'affichage"
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <SlidersHorizontal className="size-[18px]" strokeWidth={1.75} aria-hidden />
      </button>
      <div
        id={panelId}
        hidden={!open}
        role="group"
        aria-label="Préférences d'affichage"
        className="absolute right-0 top-full z-40 mt-2 w-[320px] rounded-xl border bg-popover p-4 text-popover-foreground shadow-raised"
      >
        <InterfaceModeOptions />
      </div>
    </div>
  );
}

/**
 * Le raccourci est rendu dans l'en-tête propre à chaque mode : après une bascule, il est remonté.
 * Le focus clavier est alors rendu au bouton du mode choisi (intention notée sur <html>).
 */
const FOCUS_ATTR = "data-mode-shortcut-focus";

/** Raccourci discret dans l'en-tête du tableau de bord : bascule segmentée. */
export function InterfaceModeShortcut({ className }: { className?: string }) {
  const { mode, setMode } = useInterfaceMode();
  const refs = useRef<Partial<Record<InterfaceMode, HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (mode && document.documentElement.getAttribute(FOCUS_ATTR) === mode) {
      refs.current[mode]?.focus();
      document.documentElement.removeAttribute(FOCUS_ATTR);
    }
  }, [mode]);
  const choose = (m: InterfaceMode) => {
    document.documentElement.setAttribute(FOCUS_ATTR, m);
    if (!setMode(m)) document.documentElement.removeAttribute(FOCUS_ATTR);
  };
  return (
    <div role="radiogroup" aria-label="Mode d'interface" className={cn("inline-flex h-9 items-center rounded-lg border bg-surface-2/60 p-0.5", className)} data-testid="mode-shortcut">
      {INTERFACE_MODES.map((m) => {
        const checked = mode === m;
        return (
          <button
            key={m}
            ref={(el) => {
              refs.current[m] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (mode === null && m === "analyse") ? 0 : -1}
            disabled={mode === null}
            title={INTERFACE_MODE_LABELS[m].label}
            onClick={() => choose(m)}
            onKeyDown={(e) => {
              const n = nextByKey(e.key, m);
              if (n) {
                e.preventDefault();
                choose(n);
              }
            }}
            className={cn(
              "h-full rounded-md px-3 text-[12.5px] font-medium transition-colors",
              checked ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {INTERFACE_MODE_LABELS[m].short}
          </button>
        );
      })}
    </div>
  );
}
