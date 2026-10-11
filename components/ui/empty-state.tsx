import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** État vide : icône discrète, message court, action éventuelle. */
export function EmptyState({ icon: Icon, title, children, action, className }: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center", className)}>
      {Icon ? <span className="mb-1 grid size-10 place-items-center rounded-full bg-surface-2 text-subtle-foreground"><Icon className="size-5" aria-hidden /></span> : null}
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
