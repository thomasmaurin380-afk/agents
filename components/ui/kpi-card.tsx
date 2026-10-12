import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Sens économique d'une variation : `favorable` / `defavorable` selon l'indicateur (une hausse
 * des dettes est défavorable), jamais selon le signe du nombre. `neutre` pour une information.
 */
export type Tone = "favorable" | "defavorable" | "neutre";
export type IconTone = "blue" | "red" | "green" | "violet" | "orange";

const TONES: Record<Tone, string> = {
  favorable: "bg-success-surface text-success-text",
  defavorable: "bg-destructive-surface text-destructive-text",
  neutre: "bg-surface-2 text-muted-foreground",
};
const ICON_TONES: Record<IconTone, string> = {
  blue: "bg-info-surface text-info-text",
  red: "bg-destructive-surface text-destructive-text",
  green: "bg-success-surface text-success-text",
  violet: "bg-[color-mix(in_oklab,#6a5cd9_12%,transparent)] text-[#5a4cc4] dark:text-[#b3a8f0]",
  orange: "bg-warning-surface text-warning-text",
};

/** Variation : flèche + valeur sur pastille ; la flèche suit le sens du nombre, la couleur son sens économique. */
export function DeltaBadge({ tone, direction, children, className }: { tone: Tone; direction?: "up" | "down" | "flat"; children: React.ReactNode; className?: string }) {
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : direction === "flat" ? Minus : null;
  return (
    <span className={cn("num inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold", TONES[tone], className)}>
      {Icon ? <Icon className="size-3.5" strokeWidth={2.4} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function IconTile({ tone, children, size = "md" }: { tone: IconTone; children: React.ReactNode; size?: "md" | "lg" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl [&_svg]:stroke-[1.75]", size === "lg" ? "size-12 [&_svg]:size-6" : "size-10 [&_svg]:size-5", ICON_TONES[tone])}>
      {children}
    </span>
  );
}

/** Carte d'indicateur commune aux deux modes ; la densité varie selon `variant`. */
export function KpiCard({ icon, iconTone = "blue", label, value, delta, note, sparkline, variant = "analyse", className, ...props }: {
  icon: React.ReactNode;
  iconTone?: IconTone;
  label: string;
  value: React.ReactNode;
  delta?: { tone: Tone; direction?: "up" | "down" | "flat"; label: string };
  note?: React.ReactNode;
  sparkline?: React.ReactNode;
  variant?: "analyse" | "pilotage";
  className?: string;
} & Omit<React.ComponentProps<"div">, "children">) {
  const analyse = variant === "analyse";
  return (
    <Card className={cn("flex flex-col overflow-hidden", analyse ? "p-5" : "p-5 sm:p-6", className)} {...props}>
      <div className={cn("flex gap-3.5", analyse ? "items-start" : "items-center")}>
        <IconTile tone={iconTone} size={analyse ? "lg" : "md"}>{icon}</IconTile>
        <div className="min-w-0">
          <p className={cn("font-display font-medium text-foreground", analyse ? "text-[17px]" : "text-[16.5px]")}>{label}</p>
          {analyse ? <p className="figure mt-1.5 text-[28px] 2xl:text-[32px]">{value}</p> : null}
        </div>
      </div>
      {!analyse ? <p className="figure mt-4 text-[30px] 2xl:text-[34px]">{value}</p> : null}
      {delta || note ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {delta ? <DeltaBadge tone={delta.tone} direction={delta.direction}>{delta.label}</DeltaBadge> : null}
          {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
        </div>
      ) : null}
      {sparkline ? <div className="-mx-1 mt-3">{sparkline}</div> : null}
    </Card>
  );
}
