/**
 * Courbe miniature (décorative) : la valeur et sa variation sont toujours données en texte à
 * côté. Tracé normalisé entre le minimum et le maximum de la série.
 */
export function Sparkline({ values, color = "var(--chart-1)", width = 96, height = 32, area = true, className }: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  area?: boolean;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={className}>
      {area ? <path d={`${line} L${lx.toFixed(1)},${height} L${pad},${height} Z`} fill={color} opacity={0.08} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.4} fill={color} />
    </svg>
  );
}
