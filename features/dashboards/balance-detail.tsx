"use client";

import { useId, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardData } from "@/features/design-preview/demo-data";
import { cn } from "@/lib/utils";
import { eur, pct, signedEur, signedPct } from "./format";

const TABS = [
  { key: "assets", label: "Actifs", total: "Total des actifs" },
  { key: "liabilities", label: "Passifs", total: "Total des passifs" },
  { key: "equity", label: "Capitaux propres", total: "Total des capitaux propres" },
] as const;

/** Détail des postes du bilan, par onglet (onglets accessibles au clavier). */
export function BalanceDetail({ data }: { data: DashboardData }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("assets");
  const id = useId();
  const b = data.balance;
  const rows = tab === "assets" ? b.assets : tab === "liabilities" ? b.liabilities : b.equityLines;
  const total = rows.reduce((s, r) => s + r.current, 0);
  const totalPrev = rows.reduce((s, r) => s + r.previous, 0);
  const current = TABS.find((t) => t.key === tab)!;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.key);
    document.getElementById(`${id}-${next.key}`)?.focus();
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 className="text-[21px] font-semibold tracking-[-0.01em]">Détail des postes du bilan</h2>
          <div role="tablist" aria-label="Postes du bilan" onKeyDown={onKey} className="mt-3 flex gap-1">
            {TABS.map((t) => (
              <button key={t.key} id={`${id}-${t.key}`} role="tab" type="button" aria-selected={tab === t.key} aria-controls={`${id}-panel`}
                tabIndex={tab === t.key ? 0 : -1} onClick={() => setTab(t.key)}
                className={cn("-mb-px border-b-2 px-3.5 pb-2.5 pt-1 text-[14px] transition-colors",
                  tab === t.key ? "border-primary font-medium text-primary dark:text-info-text" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[13.5px] text-muted-foreground">
          Comparaison avec <span className="font-medium text-foreground">{data.period.previous}</span>
        </p>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="border-t px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
        <Table className="min-w-[880px] [&_td]:whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <TableHead>Catégorie</TableHead>
              <TableHead className="text-right">{data.period.label}</TableHead>
              <TableHead className="text-right">{data.period.previous}</TableHead>
              <TableHead className="text-right">Variation</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="w-[30%] pl-8">Répartition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const share = total ? r.current / total : 0;
              const diff = r.current - r.previous;
              return (
                <TableRow key={r.key}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell num>{eur(r.current)}</TableCell>
                  <TableCell num className="text-muted-foreground">{eur(r.previous)}</TableCell>
                  <TableCell num>{signedEur(diff)}</TableCell>
                  <TableCell num>{signedPct(r.previous ? diff / r.previous : 0)}</TableCell>
                  <TableCell className="pl-8">
                    <span className="grid grid-cols-[1fr_48px] items-center gap-3">
                      <span className="block h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        <span className="block h-full rounded-full bg-series-blue" style={{ width: `${share * 100}%` }} />
                      </span>
                      <span className="num text-right text-[13px] text-muted-foreground">{pct(share)}</span>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-accent/70 font-semibold hover:bg-accent/70">
              <TableCell>{current.total}</TableCell>
              <TableCell num>{eur(total)}</TableCell>
              <TableCell num>{eur(totalPrev)}</TableCell>
              <TableCell num>{signedEur(total - totalPrev)}</TableCell>
              <TableCell num>{signedPct(totalPrev ? total / totalPrev - 1 : 0)}</TableCell>
              <TableCell className="pl-8">
                <span className="grid grid-cols-[1fr_48px] items-center gap-3">
                  <span className="block h-2 rounded-full bg-series-blue" aria-hidden />
                  <span className="num text-right text-[13px]">100 %</span>
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
