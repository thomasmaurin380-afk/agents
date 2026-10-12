/**
 * Barres miniatures (évolution courte, ex. six derniers mois) : la dernière barre est accentuée.
 * Équivalent textuel fourni sous forme de liste pour les lecteurs d'écran.
 */
export function MiniBars({ items, label, height = 64, color = "var(--chart-1)", muted = "var(--chart-seq-4)" }: {
  items: { label: string; longLabel: string; value: number; display: string }[];
  label: string;
  height?: number;
  color?: string;
  muted?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <figure className="m-0">
      <div aria-hidden className="flex items-end gap-2" style={{ height }}>
        {items.map((it, i) => (
          <div key={it.label} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height }}>
            <span className="w-full max-w-7 rounded-[5px]" style={{ height: Math.max(4, (it.value / max) * (height - 18)), background: i === items.length - 1 ? color : muted }} />
            <span className="text-[11px] leading-none text-muted-foreground">{it.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {label} : {items.map((it) => `${it.longLabel} ${it.display}`).join(" ; ")}
      </figcaption>
    </figure>
  );
}
