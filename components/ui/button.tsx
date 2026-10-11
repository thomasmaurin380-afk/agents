import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Hiérarchie des actions : `default` (primaire, bleu royal) · `outline` (secondaire) ·
 * `ghost` / `link` (tertiaire) · `destructive` (irréversible, toujours derrière une confirmation).
 * `secondary` : action neutre sur fond teinté.
 */
export const buttonVariants = cva(
  [
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover active:bg-primary-hover/90",
        destructive: "bg-destructive-text text-destructive-foreground shadow-card hover:bg-destructive-text/90 active:bg-destructive-text/80 dark:bg-destructive dark:hover:bg-destructive/90",
        outline: "border border-border-strong bg-card text-foreground shadow-card hover:bg-surface-2 active:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-border active:bg-border-strong",
        ghost: "text-muted-foreground hover:bg-surface-2 hover:text-foreground active:bg-muted",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline dark:text-info-text",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-[15px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
