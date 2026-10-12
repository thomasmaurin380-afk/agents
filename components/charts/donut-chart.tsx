export type DonutSlice = {
  label: string;
  value: number;
  color: string;
  /** Libellé exact de la valeur (montant) ; masqué si absent et `showValues` faux. */
  valueLabel?: string;
  /** Part déjà calculée par le modèle (« 38,0 % ») ; à défaut, calculée ici pour l'affichage. */
  shareLabel?: string;
};

/**
 * Anneau de répartition : segments séparés par un liseré de la couleur de surface, valeur
 * centrale, légende alignée (libellé, effectif, pourcentage). Les catégories ordonnées
 * utilisent une rampe séquentielle d'une seule teinte.
 */
export function DonutChart({ slices, centerValue, centerLabel, size = 156, thickness = 26, label, showValues = true, layout = "row" }: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  thickness?: number;
  label: string;
  showValues?: boolean;
  /** `row` : légende à droite (à partir de sm) ; `stack` : légende sous l'anneau. */
  layout?: "row" | "stack";
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  // Angles cumulés calculés sans mutation (départ à midi, sens horaire).
  const starts = slices.map((_, i) => -Math.PI / 2 + (total ? (slices.slice(0, i).reduce((a, x) => a + x.value, 0) / total) * Math.PI * 2 : 0));
  const p = (a: number, radius = r) => `${c + radius * Math.cos(a)},${c + radius * Math.sin(a)}`;
  const arcs = slices.map((s, i) => {
    const sweep = total ? (s.value / total) * Math.PI * 2 : 0;
    const a0 = starts[i];
    const a1 = a0 + sweep;
    return { ...s, a0, d: `M${p(a0)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p(a1)}` };
  });
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)} %` : "—");
  return (
    <div className={layout === "row" ? "flex flex-col items-center gap-6 sm:flex-row sm:items-center xl:gap-5" : "flex flex-col items-center gap-6"}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={label}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          {arcs.map((a) => (
            <path key={a.label} d={a.d} fill="none" stroke={a.color} strokeWidth={thickness} />
          ))}
          {/* Liserés de séparation (2 px, couleur de surface). */}
          {arcs.length > 1
            ? arcs.map((a) => (
                <line key={a.label} x1={c + (r - thickness / 2 - 1) * Math.cos(a.a0)} y1={c + (r - thickness / 2 - 1) * Math.sin(a.a0)}
                  x2={c + (r + thickness / 2 + 1) * Math.cos(a.a0)} y2={c + (r + thickness / 2 + 1) * Math.sin(a.a0)} stroke="var(--card)" strokeWidth={2.5} />
              ))
            : null}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <p className="figure text-[26px] font-bold">{centerValue}</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{centerLabel}</p>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-3">
        {slices.map((s) => (
          <li key={s.label} className={showValues ? "grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2.5 text-[13.5px]" : "grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 text-[13.5px]"}>
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="leading-tight text-foreground">{s.label}</span>
            {showValues ? <span className="num min-w-5 text-right font-medium">{s.valueLabel ?? s.value}</span> : null}
            <span className="num min-w-9 text-right text-muted-foreground">{s.shareLabel ?? pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
