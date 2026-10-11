import { cn } from "@/lib/utils";

/**
 * Identité provisoire du produit (aucun nom ni logo définitif validé) : monogramme « DAF »
 * sur carré bleu royal.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-royal text-[11px] font-bold tracking-wide text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]", className)}
    >
      DAF
    </span>
  );
}
