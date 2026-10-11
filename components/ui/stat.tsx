import type * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Chiffre de synthèse : libellé, valeur (taille et position, pas de couleur), précision. */
export function Stat({ label, value, hint, className, ...props }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <Card className={cn("flex flex-col gap-2 p-5", className)} {...props}>
      <p className="eyebrow">{label}</p>
      <p className="num text-[1.75rem] font-semibold leading-none tracking-tight">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
