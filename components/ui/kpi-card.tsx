import type * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Sens économique d'une variation : `favorable` / `defavorable` selon l'indicateur (une baisse de
 * charges est favorable), jamais selon le signe du nombre. `neutre` pour une simple information.
 */
export type Tone = "favorable" | "defavorable" | "neutre";

const TONES: Record<Tone, string> = {
  favorable: "bg-success-surface text-success-text",
  defavorable: "bg-destructive-surface text-destructive-text",
  neutre: "bg-surface-2 text-muted-foreground",
};
const TEXT: Record<Tone, string> = { favorable: "text-success-text", defavorable: "text-destructive-text", neutre: "text-foreground" };

export function DeltaBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn("num inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-semibold", TONES[tone])}>{children}</span>;
}

/** Carte d'indicateur : icône + libellé, valeur principale, variation, comparaison. */
export function KpiCard({ icon, label, value, delta, comparison, className, ...props }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  delta?: { tone: Tone; label: string };
  comparison?: { tone: Tone; amount: string; text: string };
  className?: string;
} & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <Card className={cn("flex flex-col p-5", className)} {...props}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent text-primary dark:text-info-text [&_svg]:size-5 [&_svg]:stroke-[1.75]">{icon}</span>
        <p className="text-[15px] font-medium text-foreground">{label}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="figure text-[28px] font-bold xl:text-[30px]">{value}</p>
        {delta ? <DeltaBadge tone={delta.tone}>{delta.label}</DeltaBadge> : null}
      </div>
      {comparison ? (
        <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
          <span className={cn("num font-semibold", TEXT[comparison.tone])}>{comparison.amount}</span> {comparison.text}
        </p>
      ) : null}
    </Card>
  );
}
