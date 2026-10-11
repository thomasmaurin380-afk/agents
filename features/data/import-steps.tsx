import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Téléversement", "Correspondance des colonnes", "Contrôles", "Prévisualisation", "Enregistrement"] as const;

/** Parcours d'un import (Importer → Analyser → Vérifier → Valider) et étape en cours, déduite du statut. */
export function ImportSteps({ status, kind }: { status: string; kind: string }) {
  const done =
    status === "new" ? 0
      : status === "committed" || status === "superseded" ? 5 : status === "mapped" ? 4 : kind === "fec" ? 2 : 1;
  return (
    <ol className="mb-6 grid gap-2 rounded-xl border bg-card p-3 text-xs shadow-card sm:grid-cols-5 sm:gap-0 sm:p-0" aria-label="Étapes de l'import" data-testid="import-steps">
      {STEPS.map((s, i) => {
        const isDone = i < done;
        const isCurrent = i === done && status !== "cancelled";
        return (
          <li
            key={s}
            className={cn("flex items-center gap-2.5 sm:px-4 sm:py-3.5", i > 0 && "sm:border-l", isCurrent && "sm:bg-accent/60")}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold text-muted-foreground",
                isDone && "border-success bg-success text-white",
                isCurrent && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {isDone ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("leading-tight", isCurrent ? "font-semibold text-foreground" : isDone ? "text-foreground" : "text-muted-foreground")}>
              {s}
              {isDone ? <span className="sr-only"> (terminée)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
