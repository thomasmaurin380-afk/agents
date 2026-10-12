"use client";

import { useEffect, useId, useRef, useState } from "react";

export type BarSeries = { key: string; label: string; color: string; values: number[] };

/** Formats disponibles (sérialisables depuis un composant serveur). */
const FORMATS = {
  eur: (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v),
  keur: (v: number) => (v === 0 ? "0 €" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v / 1000)} k€`),
  meur: (v: number) => (v === 0 ? "0 €" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v / 1_000_000)} M€`),
} as const;
export type ChartFormat = keyof typeof FORMATS;

/**
 * Histogramme (groupé) avec courbe optionnelle, en SVG sans dépendance : axe unique (même unité),
 * quadrillage discret, barres à extrémité arrondie (pleines ou dégradé doux), repère vertical et
 * info-bulle au survol comme au clavier, tableau équivalent pour les lecteurs d'écran.
 */
export function BarChart({
  categories, fullCategories, series, lines = [], max, ticks, tickFormat = "keur", valueFormat = "eur",
  height = 240, label, barStyle = "solid", maxBarWidth = 30,
}: {
  categories: string[];
  fullCategories?: string[];
  series: BarSeries[];
  /** Séries tracées en courbe, sur le même axe. */
  lines?: BarSeries[];
  max: number;
  ticks: number[];
  tickFormat?: ChartFormat;
  valueFormat?: ChartFormat;
  height?: number;
  label: string;
  barStyle?: "solid" | "soft";
  maxBarWidth?: number;
}) {
  const formatTick = FORMATS[tickFormat];
  const formatValue = FORMATS[valueFormat];
  const uid = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const left = 52, right = 8, top = 12, bottom = 30;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const band = plotW / categories.length;
  const gap = series.length > 1 ? 4 : 0;
  const barW = Math.min(maxBarWidth, Math.max(6, (band * 0.66 - gap * (series.length - 1)) / Math.max(1, series.length)));
  const groupW = series.length * barW + (series.length - 1) * gap;
  const y = (v: number) => top + plotH - (Math.max(0, v) / max) * plotH;
  const cx = (i: number) => left + band * i + band / 2;
  const names = fullCategories ?? categories;
  /** Libellés d'axe espacés quand la place manque (le détail reste dans l'info-bulle). */
  const labelStep = band < 34 ? 2 : 1;
  const all = [...series, ...lines];

  const bar = (x: number, v: number) => {
    const h = Math.max(0, (v / max) * plotH);
    const r = Math.min(4, h, barW / 2);
    const yb = top + plotH;
    return `M${x},${yb} V${yb - h + r} Q${x},${yb - h} ${x + r},${yb - h} H${x + barW - r} Q${x + barW},${yb - h} ${x + barW},${yb - h + r} V${yb} Z`;
  };
  /** Courbe lissée (Catmull-Rom → Bézier). */
  const curve = (vals: number[]) => {
    const pts = vals.map((v, i) => [cx(i), y(v)] as const);
    return pts.map(([px, py], i) => {
      if (i === 0) return `M${px},${py}`;
      const [x0, y0] = pts[Math.max(0, i - 2)];
      const [x1, y1] = pts[i - 1];
      const [x3, y3] = pts[Math.min(pts.length - 1, i + 1)];
      return `C${x1 + (px - x0) / 6},${y1 + (py - y0) / 6} ${px - (x3 - x1) / 6},${py - (y3 - y1) / 6} ${px},${py}`;
    }).join(" ");
  };
  const tipTop = active === null ? 0 : Math.max(0, Math.min(...all.map((s) => y(s.values[active]))) - 12);

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setActive(null)}>
      <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: s.color, stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: s.color, stopOpacity: barStyle === "soft" ? 0.35 : 1 }} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--chart-axis)] text-[11.5px]">{formatTick(t)}</text>
          </g>
        ))}
        {active !== null ? <line x1={cx(active)} x2={cx(active)} y1={top} y2={top + plotH} stroke="var(--series-blue)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} /> : null}
        {categories.map((c, i) => {
          const x0 = left + band * i + (band - groupW) / 2;
          return (
            <g key={c}>
              {series.map((s, k) => (
                <path key={s.key} d={bar(x0 + k * (barW + gap), s.values[i])} fill={`url(#${uid}-${s.key})`}
                  opacity={active === null || active === i ? 1 : 0.5} className="transition-opacity duration-150" />
              ))}
              {i % labelStep === 0 ? <text x={cx(i)} y={height - 8} textAnchor="middle" className="fill-[var(--chart-axis)] text-[12px]">{c}</text> : null}
            </g>
          );
        })}
        {lines.map((l) => (
          <g key={l.key}>
            <path d={curve(l.values)} fill="none" stroke={l.color} strokeWidth={2} strokeLinecap="round" />
            {l.values.map((v, i) => (
              <circle key={i} cx={cx(i)} cy={y(v)} r={active === i ? 5 : 3} fill={active === i ? "var(--card)" : l.color} stroke={l.color} strokeWidth={2} />
            ))}
          </g>
        ))}
        {categories.map((c, i) => (
          <rect key={`hit-${c}`} x={left + band * i} y={top} width={band} height={plotH} fill="transparent" tabIndex={0}
            aria-label={`${names[i]} : ${all.map((s) => `${s.label} ${formatValue(s.values[i])}`).join(", ")}`}
            onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            className="cursor-default outline-none focus-visible:stroke-[var(--ring)] focus-visible:stroke-2" />
        ))}
      </svg>
      {active !== null ? (
        <div role="presentation"
          className="pointer-events-none absolute z-10 min-w-52 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border bg-card px-3.5 py-2.5 text-[12.5px] text-foreground shadow-raised"
          style={{ left: Math.min(Math.max(cx(active), 110), width - 110), top: tipTop }}>
          <p className="mb-1.5 font-semibold first-letter:uppercase">{names[active]}</p>
          {all.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
              <span className="num font-semibold">{formatValue(s.values[active])}</span>
            </p>
          ))}
        </div>
      ) : null}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead><tr><th>Période</th>{all.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
          <tbody>{names.map((c, i) => <tr key={c}><td>{c}</td>{all.map((s) => <td key={s.key}>{formatValue(s.values[i])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
