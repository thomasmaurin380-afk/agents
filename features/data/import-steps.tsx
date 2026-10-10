import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Téléversement", "Correspondance des colonnes", "Contrôles", "Prévisualisation", "Enregistrement"] as const;

/** Parcours d'un import et étape en cours (déduite du statut). */
export function ImportSteps({ status, kind }: { status: string; kind: string }) {
  const done =
    status === "committed" || status === "superseded" ? 5 : status === "mapped" ? 4 : kind === "fec" ? 2 : 1;
  return (
    <ol className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Étapes de l'import" data-testid="import-steps">
      {STEPS.map((s, i) => {
        const isDone = i < done;
        const isCurrent = i === done && status !== "cancelled";
        return (
          <li key={s} className="flex items-center gap-1.5" aria-current={isCurrent ? "step" : undefined}>
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full border text-[10px] font-semibold",
                isDone && "border-success bg-success/15 text-success",
                isCurrent && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {isDone ? <Check className="size-3" aria-hidden /> : i + 1}
            </span>
            <span className={cn(isCurrent ? "font-medium" : "text-muted-foreground")}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
