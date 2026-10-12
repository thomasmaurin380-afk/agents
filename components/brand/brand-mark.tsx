import { cn } from "@/lib/utils";

/**
 * Identité provisoire du produit (aucun nom ni logo définitif validé) : pastille bleu royal
 * avec une flèche de progression stylisée.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <circle cx="16" cy="16" r="16" fill="var(--royal)" />
      <path d="M12 9.5 22.5 16 12 22.5Z" fill="#fff" fillOpacity="0.95" />
    </svg>
  );
}

export function BrandLockup({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <BrandMark />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[18px] font-semibold tracking-[-0.02em] text-foreground">Plateforme DAF</span>
        {subtitle ? <span className="block truncate text-[12px] text-muted-foreground md:hidden">{subtitle}</span> : null}
      </span>
    </span>
  );
}
