import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Statuts. Le libellé porte toujours le sens (jamais la couleur seule) ; les statuts
 * sémantiques ajoutent une pastille.
 */
const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-accent-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border-strong bg-card text-muted-foreground",
        success: "border-transparent bg-success-surface text-success-text before:size-1.5 before:shrink-0 before:rounded-full before:content-[''] before:bg-success",
        warning: "border-transparent bg-warning-surface text-warning-text before:size-1.5 before:shrink-0 before:rounded-full before:content-[''] before:bg-warning",
        destructive: "border-transparent bg-destructive-surface text-destructive-text before:size-1.5 before:shrink-0 before:rounded-full before:content-[''] before:bg-destructive",
        info: "border-transparent bg-info-surface text-info-text before:size-1.5 before:shrink-0 before:rounded-full before:content-[''] before:bg-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
