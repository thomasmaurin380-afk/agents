import { cn } from "@/lib/utils";

/**
 * Identité provisoire du produit (aucun nom ni logo définitif validé) : monogramme « DAF ».
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] bg-royal font-display text-[10.5px] font-bold tracking-[0.04em] text-white", className)}
    >
      DAF
    </span>
  );
}

export function BrandLockup({ subtitle }: { subtitle: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandMark />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-foreground">Plateforme DAF</span>
        <span className="block truncate text-[12px] text-muted-foreground">{subtitle}</span>
      </span>
    </span>
  );
}
