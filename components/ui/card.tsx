import * as React from "react";
import { cn } from "@/lib/utils";

/** Surface de travail : fond blanc, bordure légère, ombre quasi imperceptible. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0 rounded-[var(--radius-card)] border bg-card text-card-foreground shadow-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1 p-5 pb-4 sm:p-6 sm:pb-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-[18px] font-semibold leading-snug tracking-[-0.01em]", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  // Sans en-tête, le contenu garde son padding complet ; après un en-tête, il s'y raccorde.
  return <div className={cn("p-5 sm:p-6 [[data-slot=card-header]+&]:pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 border-t px-5 py-4 sm:px-6", className)} {...props} />;
}
