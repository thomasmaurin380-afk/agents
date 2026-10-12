"use client";

import { Building2, CalendarDays, ChevronDown } from "lucide-react";
import { useId } from "react";
import { DEMO_ENTITIES } from "./data";
import { isScope, type Scope } from "./model";

/**
 * Période affichée. La maquette ne contient qu'une clôture : la période est donc indiquée, pas
 * sélectionnable (aucun faux contrôle).
 */
export function PeriodChip({ label, title }: { label: string; title: string }) {
  return (
    <span title={title} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-[13px] font-medium text-foreground shadow-card" data-testid="period">
      <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="sr-only">Période : </span>
      {label}
    </span>
  );
}

/** Périmètre : groupe (consolidé) ou une entité. Conservé dans l'adresse, donc entre les deux modes. */
export function EntitySelect({ value, onChange }: { value: Scope; onChange: (s: Scope) => void }) {
  const id = useId();
  return (
    <span className="relative inline-flex h-9 items-center rounded-lg border bg-card shadow-card focus-within:ring-2 focus-within:ring-ring">
      <Building2 className="pointer-events-none absolute left-3 size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <label htmlFor={id} className="sr-only">Périmètre</label>
      <select
        id={id}
        value={value}
        onChange={(e) => isScope(e.target.value) && onChange(e.target.value)}
        className="h-full appearance-none rounded-lg bg-transparent pl-9 pr-8 text-[13px] font-medium text-foreground outline-none"
        data-testid="entity-select"
      >
        <option value="all">Toutes les entités</option>
        {DEMO_ENTITIES.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" aria-hidden />
    </span>
  );
}
