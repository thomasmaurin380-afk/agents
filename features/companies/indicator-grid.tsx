import { InsufficientDataCard } from "@/components/indicator-placeholder";
import { availability, HEADLINE_INDICATORS } from "@/domain/indicators/availability";
import type { DataSource } from "@/domain/shared/computation";

/**
 * Grille des indicateurs d'en-tête. En phase 1, aucune source n'est importable : tous les
 * indicateurs s'affichent en « Données insuffisantes » avec la source manquante.
 */
export function IndicatorGrid({ available }: { available: ReadonlySet<DataSource> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {HEADLINE_INDICATORS.map((ind) => {
        const c = availability(ind.requires, available);
        return c.status === "insufficient_data" ? (
          <InsufficientDataCard key={ind.code} label={ind.label} computation={c} />
        ) : (
          // Sources présentes mais moteur de calcul pas encore livré : on le dit, sans valeur.
          <InsufficientDataCard
            key={ind.code}
            label={ind.label}
            computation={{ status: "insufficient_data", missing: [], reason: "Calcul disponible en phase 4" }}
          />
        );
      })}
    </div>
  );
}
