import { CircleDashed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { describeMissing, type Computation } from "@/domain/shared/computation";

/** Carte d'indicateur en état « Données insuffisantes » (aucune valeur inventée). */
export function InsufficientDataCard({
  label,
  computation,
}: {
  label: string;
  computation: Extract<Computation<unknown>, { status: "insufficient_data" }>;
}) {
  return (
    <Card data-testid="indicator-insufficient" className="flex flex-col gap-3 p-5">
      <p className="eyebrow">{label}</p>
      <p className="flex items-center gap-2 text-[15px] font-medium text-muted-foreground">
        <CircleDashed className="size-4 text-subtle-foreground" aria-hidden />
        Données insuffisantes
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{describeMissing(computation)}</p>
    </Card>
  );
}
