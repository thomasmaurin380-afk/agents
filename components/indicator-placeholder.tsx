import { CircleAlert } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card data-testid="indicator-insufficient">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
          <CircleAlert className="size-4 text-warning" aria-hidden />
          Données insuffisantes
        </CardTitle>
        <p className="text-xs text-muted-foreground">{describeMissing(computation)}</p>
      </CardHeader>
    </Card>
  );
}
