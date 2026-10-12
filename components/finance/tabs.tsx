"use client";

import { useId, useRef } from "react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Onglets accessibles (motif ARIA « tabs ») : flèches gauche/droite, Début, Fin ; activation
 * automatique. Le contenu de l'onglet actif est rendu par l'appelant.
 */
export function Tabs<K extends string>({ tabs, value, onChange, label, children, className }: {
  tabs: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const base = useId();
  const refs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
  const move = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    onChange(tabs[j].key);
    refs.current[tabs[j].key]?.focus();
  };
  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="inline-flex h-9 items-center gap-0.5 rounded-lg border bg-surface-2/60 p-0.5">
        {tabs.map((t, i) => {
          const selected = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[t.key] = el;
              }}
              id={`${base}-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.key)}
              onKeyDown={(e) => move(e, i)}
              className={cn("h-full rounded-md px-3 text-[12.5px] font-medium transition-colors", selected ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${value}`} tabIndex={0} className="mt-3 rounded-md focus-visible:outline-2">
        {children}
      </div>
    </div>
  );
}
