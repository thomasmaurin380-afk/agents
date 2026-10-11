import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Message contextuel. Bordure gauche colorée + texte lisible (AA) ; le contenu porte le sens. */
const alertVariants = cva(
  "relative w-full rounded-lg border border-l-[3px] px-4 py-3 text-sm leading-relaxed [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-border border-l-border-strong bg-card text-foreground",
        info: "border-info/20 border-l-info bg-info-surface text-foreground",
        success: "border-success/25 border-l-success bg-success-surface text-foreground",
        warning: "border-warning/30 border-l-warning bg-warning-surface text-foreground",
        destructive: "border-destructive/30 border-l-destructive bg-destructive-surface text-destructive-text",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="status" className={cn(alertVariants({ variant }), className)} {...props} />;
}
