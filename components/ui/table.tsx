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
  return <tr className={cn("border-b transition-colors hover:bg-surface-2/60", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("eyebrow h-10 whitespace-nowrap bg-surface-2/50 px-3 text-left align-middle first:pl-4 last:pr-4", className)}
      {...props}
    />
  );
}
export function TableCell({ className, num, ...props }: React.ComponentProps<"td"> & { num?: boolean }) {
  return <td className={cn("px-3 py-3 align-middle first:pl-4 last:pr-4", num && "num text-right", className)} {...props} />;
}
