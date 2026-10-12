import { cn } from "@/lib/utils";

/** Barre de proportion horizontale (part d'un total), toujours accompagnée de sa valeur en texte. */
export function ShareBar({ value, max = 100, className, tone = "primary" }: { value: number; max?: number; className?: string; tone?: "primary" | "muted" | "warning" }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span aria-hidden className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <span
        className={cn("block h-full rounded-full", tone === "primary" && "bg-chart-1", tone === "muted" && "bg-[var(--chart-seq-3)]", tone === "warning" && "bg-warning")}
        style={{ width: `${w}%` }}
      />
    </span>
  );
}
