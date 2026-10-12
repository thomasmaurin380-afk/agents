import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tableaux financiers : en-têtes discrets, lignes respirantes, survol subtil. Le défilement
 * horizontal reste confiné au tableau (jamais à la page). Montants : `TableCell` + `num`
 * (alignés à droite, chiffres tabulaires).
 */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto overscroll-x-contain">
      <table className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:hover:bg-transparent", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border/80 transition-colors hover:bg-surface-2/45", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("h-10 whitespace-nowrap px-3 text-left align-middle text-[12px] font-medium text-muted-foreground first:pl-5 last:pr-5", className)}
      {...props}
    />
  );
}
export function TableCell({ className, num, ...props }: React.ComponentProps<"td"> & { num?: boolean }) {
  return <td className={cn("px-3 py-[var(--cell-py)] align-middle first:pl-5 last:pr-5", num && "num text-right", className)} {...props} />;
}
