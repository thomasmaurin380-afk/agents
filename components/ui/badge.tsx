import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Statuts : libellé explicite (le sens ne dépend jamais de la couleur seule), teinte sobre. */
const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-accent-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border-strong bg-card text-muted-foreground",
        success: "border-transparent bg-success-surface text-success-text",
        warning: "border-transparent bg-warning-surface text-warning-text",
        destructive: "border-transparent bg-destructive-surface text-destructive-text",
        info: "border-transparent bg-info-surface text-info-text",
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
