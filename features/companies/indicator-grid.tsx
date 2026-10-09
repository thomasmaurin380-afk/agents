import { InsufficientDataCard } from "@/components/indicator-placeholder";
import { availability, HEADLINE_INDICATORS } from "@/domain/indicators/availability";
import type { DataSource } from "@/domain/shared/computation";

/**
 * Grille des indicateurs d'en-tête. Sans la source requise : « Données insuffisantes » + source
 * manquante. Avec la source : le calcul arrive en phase 4 (aucune valeur affichée d'ici là).
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
