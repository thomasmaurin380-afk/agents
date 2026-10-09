import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-lg border px-4 py-3 text-sm [&_svg]:size-4", {
  variants: {
    variant: {
      default: "bg-card",
      info: "border-primary/30 bg-primary/5",
      warning: "border-warning/50 bg-warning/10",
      destructive: "border-destructive/40 bg-destructive/5 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="status" className={cn(alertVariants({ variant }), className)} {...props} />;
}
