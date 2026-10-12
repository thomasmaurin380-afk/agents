"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { InterfaceModeSwitch } from "./interface-mode";
import { ThemeToggle } from "./theme";

/** Profil connecté et préférences d'affichage (mode d'interface, thème). */
export function ProfileMenu({ userName, userRoleLabel, initials }: { userName: string; userRoleLabel: string; initials: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2/60"
      >
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">{initials}</span>
        <span className="leading-tight">
          <span className="block max-w-48 truncate font-display text-[15px] font-semibold" data-testid="current-user">{userName}</span>
          <span className="mt-0.5 block max-w-48 truncate text-[12.5px] text-muted-foreground">{userRoleLabel}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        <span className="sr-only">Préférences d&apos;affichage</span>
      </button>
      {open ? (
        <div id={panelId} role="dialog" aria-label="Préférences d'affichage" className="absolute right-0 top-full z-40 mt-2 w-[340px] rounded-2xl border bg-card p-4 shadow-raised">
          <p className="mb-2.5 text-[12.5px] font-semibold text-foreground">Mode d&apos;interface</p>
          <InterfaceModeSwitch variant="detailed" />
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-[13px] text-muted-foreground">Thème clair / sombre</span>
            <ThemeToggle />
          </div>
        </div>
      ) : null}
    </div>
  );
}
