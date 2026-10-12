"use client";

import { useEffect, useRef, useState } from "react";

export type BarSeries = { key: string; label: string; color: string; values: number[] };

/** Formats disponibles (sérialisables depuis un composant serveur). */
const FORMATS = {
  eur: (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v),
  keur: (v: number) => (v === 0 ? "0" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v / 1000)} k€`),
} as const;
export type ChartFormat = keyof typeof FORMATS;

/**
 * Histogramme groupé (SVG, sans dépendance) : axe unique, quadrillage discret, barres fines à
 * extrémités arrondies, info-bulle au survol et au clavier, tableau équivalent pour les lecteurs
 * d'écran. Les séries portent leur couleur ; les textes restent en couleurs de texte.
 */
export function BarChart({ categories, fullCategories, series, max, ticks, tickFormat = "keur", valueFormat = "eur", height = 240, label }: {
  categories: string[];
  /** Libellés longs (info-bulle, tableau accessible). */
  fullCategories?: string[];
  series: BarSeries[];
  max: number;
  ticks: number[];
  tickFormat?: ChartFormat;
  valueFormat?: ChartFormat;
  height?: number;
  label: string;
}) {
  const formatTick = FORMATS[tickFormat];
  const formatValue = FORMATS[valueFormat];
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const left = 52, right = 8, top = 12, bottom = 30;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const band = plotW / categories.length;
  const barW = Math.min(30, Math.max(10, (band * 0.62) / series.length - 4));
  const gap = 6;
  const groupW = series.length * barW + (series.length - 1) * gap;
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const names = fullCategories ?? categories;

  /** Barre à extrémité supérieure arrondie (4 px), ancrée à la ligne de base. */
  const bar = (x: number, v: number) => {
    const h = Math.max(0, (v / max) * plotH);
    const r = Math.min(4, h, barW / 2);
    const yb = top + plotH;
    return `M${x},${yb} V${yb - h + r} Q${x},${yb - h} ${x + r},${yb - h} H${x + barW - r} Q${x + barW},${yb - h} ${x + barW},${yb - h + r} V${yb} Z`;
  };

  const tipX = active === null ? 0 : left + band * active + band / 2;
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setActive(null)}>
      <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={left - 12} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--chart-axis)] text-[12px]">{formatTick(t)}</text>
          </g>
        ))}
        {categories.map((c, i) => {
          const x0 = left + band * i + (band - groupW) / 2;
          return (
            <g key={c}>
              {series.map((s, k) => (
                <path
                  key={s.key}
                  d={bar(x0 + k * (barW + gap), s.values[i])}
                  fill={s.color}
                  opacity={active === null || active === i ? 1 : 0.45}
                  className="transition-opacity duration-150"
                />
              ))}
              <text x={left + band * i + band / 2} y={height - 8} textAnchor="middle" className="fill-[var(--chart-axis)] text-[12.5px]">{c}</text>
              {/* Zone de survol plus large que les barres. */}
              <rect
                x={left + band * i}
                y={top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${names[i]} : ${series.map((s) => `${s.label} ${formatValue(s.values[i])}`).join(", ")}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-default outline-none focus-visible:stroke-[var(--ring)] focus-visible:stroke-2"
              />
            </g>
          );
        })}
      </svg>
      {active !== null ? (
        <div
          role="presentation"
          className="pointer-events-none absolute z-10 min-w-52 whitespace-nowrap -translate-x-1/2 -translate-y-full rounded-[10px] bg-[#192536] px-3.5 py-2.5 text-[12.5px] text-white shadow-raised dark:bg-[#0b0f16] dark:ring-1 dark:ring-white/10"
          style={{ left: Math.min(Math.max(tipX, 110), width - 110), top: y(Math.max(...series.map((s) => s.values[active]))) - 10 }}
        >
          <p className="mb-1.5 font-semibold">{names[active]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
              <span className="num font-semibold">{formatValue(s.values[active])}</span>
            </p>
          ))}
        </div>
      ) : null}
      <div className="sr-only"><table>
        <caption>{label}</caption>
        <thead><tr><th>Période</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{names.map((c, i) => <tr key={c}><td>{c}</td>{series.map((s) => <td key={s.key}>{formatValue(s.values[i])}</td>)}</tr>)}</tbody>
      </table></div>
    </div>
  );
}
