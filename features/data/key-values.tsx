import { displayValue } from "./format";

export function KeyValues({ values }: { values: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4" data-testid="import-summary">
      {Object.entries(values).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{displayValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
