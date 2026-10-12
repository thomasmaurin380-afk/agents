"use client";

import { useState } from "react";
import type * as React from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { compactEuros, euros, percent, plotValue, points } from "@/components/finance/format";
import { ShareBar } from "@/components/finance/share-bar";
import { Tabs } from "@/components/finance/tabs";
import { Card } from "@/components/ui/card";
import { DeltaBadge } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InterfaceModeShortcut } from "@/features/interface-mode/controls";
import { cn } from "@/lib/utils";
import type { AmountMetric, DashboardModel, DetailRow, RatioMetric, Scope } from "./model";
import { EntitySelect, PeriodChip } from "./controls";

const CAT = ["var(--chart-cat-1)", "var(--chart-cat-2)", "var(--chart-cat-3)", "var(--chart-cat-4)", "var(--chart-cat-5)"];
const share = (s: string | null) => (s ? Number(s.replace(",", ".")) : 0);

function SectionHead({ title, meta, children }: { title: string; meta?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-[family-name:var(--font-ui)] text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {meta ? <span className="text-[12px] text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

function AmountKpi({ m, context }: { m: AmountMetric; context: string }) {
  return (
    <Card className="flex flex-col rounded-[var(--dash-radius)] p-[var(--dash-pad)]" data-kpi={m.key}>
      <p className="text-[12.5px] font-medium text-muted-foreground">{m.label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-editorial text-[26px] font-medium leading-none tracking-[-0.01em] xl:text-[28px]">{euros(m.value)}</p>
        {m.series ? <Sparkline values={m.series.map(plotValue)} color={m.tone === "defavorable" ? "var(--destructive)" : "var(--chart-1)"} width={84} height={30} className="hidden shrink-0 sm:block" /> : null}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
        {m.variation ? <DeltaBadge tone={m.tone}>{percent(m.variation.percent, { signed: true })}</DeltaBadge> : null}
        <span>{context}</span>
      </p>
    </Card>
  );
}

function RatioKpi({ m, context }: { m: RatioMetric; context: string }) {
  return (
    <Card className="flex flex-col rounded-[var(--dash-radius)] p-[var(--dash-pad)]" data-kpi={m.key}>
      <p className="text-[12.5px] font-medium text-muted-foreground">{m.label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-editorial text-[26px] font-medium leading-none xl:text-[28px]">{percent(m.value)}</p>
        {m.series ? <Sparkline values={m.series.map((v) => share(v))} color="var(--chart-1)" width={84} height={30} className="hidden shrink-0 sm:block" /> : null}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
        {m.deltaPoints ? <DeltaBadge tone={m.tone}>{points(m.deltaPoints)}</DeltaBadge> : null}
        <span>{context}</span>
      </p>
    </Card>
  );
}

function DetailTable({ rows, total, totalN1, totalVariation, nLabel, n1Label }: {
  rows: DetailRow[]; total: string; totalN1: string; totalVariation: DetailRow["variation"]; nLabel: string; n1Label: string;
}) {
  return (
    <Table className="min-w-[760px] text-[13px]">
      <TableHeader>
        <TableRow>
          <TableHead>Poste</TableHead>
          <TableHead className="text-right">{nLabel}</TableHead>
          <TableHead className="text-right">{n1Label}</TableHead>
          <TableHead className="text-right">Variation</TableHead>
          <TableHead className="text-right">Var. %</TableHead>
          <TableHead className="w-[22%]">Répartition</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="py-2.5">{r.label}</TableCell>
            <TableCell num className="py-2.5 font-medium">{euros(r.n)}</TableCell>
            <TableCell num className="py-2.5 text-muted-foreground">{euros(r.n1)}</TableCell>
            <TableCell num className="py-2.5">{r.variation ? euros(r.variation.amount, { signed: true }) : "—"}</TableCell>
            <TableCell num className="py-2.5 text-muted-foreground">{r.variation ? percent(r.variation.percent, { signed: true }) : "—"}</TableCell>
            <TableCell className="py-2.5">
              <span className="flex items-center gap-2.5">
                <ShareBar value={share(r.share)} className="flex-1" />
                <span className="num w-12 text-right text-[12px] text-muted-foreground">{percent(r.share)}</span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <tfoot>
        <tr className="border-t-2 border-border-strong font-semibold">
          <td className="py-2.5 pl-5 pr-3">Total</td>
          <td className="num px-3 py-2.5 text-right">{euros(total)}</td>
          <td className="num px-3 py-2.5 text-right text-muted-foreground">{euros(totalN1)}</td>
          <td className="num px-3 py-2.5 text-right">{totalVariation ? euros(totalVariation.amount, { signed: true }) : "—"}</td>
          <td className="num px-3 py-2.5 text-right text-muted-foreground">{totalVariation ? percent(totalVariation.percent, { signed: true }) : "—"}</td>
          <td className="py-2.5 pl-3 pr-5" />
        </tr>
      </tfoot>
    </Table>
  );
}

/**
 * MODE ANALYSE : lecture patrimoniale dense. Quatre indicateurs de bilan en bandeau, graphique
 * mensuel et répartition côte à côte, puis deux tableaux détaillés (entités, postes du bilan).
 */
export function AnalyseDashboard({ model, firstName, onScopeChange }: { model: DashboardModel; firstName: string; onScopeChange: (s: Scope) => void }) {
  const [tab, setTab] = useState<"actifs" | "passifs" | "capitaux">("actifs");
  const { kpis, period } = model;
  const ctx = `vs ${period.previousMonthLabel}${model.scope === "all" ? "" : " · comptes sociaux"}`;
  const max = 5_000_000;
  const detail = model.balanceDetail[tab];
  return (
    <div className="space-y-[var(--dash-gap)]">
      <header className="flex flex-col gap-4 pb-1 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-editorial text-[30px] font-medium leading-tight tracking-[-0.015em] sm:text-[34px]">Bonjour {firstName},</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Analyse financière · bilan consolidé au {period.closingLongLabel} · <span className="font-medium text-foreground">{model.scopeLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodChip label={period.closingLabel} title="Situation de fin de période (maquette : une seule clôture disponible)" />
          <EntitySelect value={model.scope} onChange={onScopeChange} />
          <InterfaceModeShortcut />
        </div>
      </header>

      <section aria-label="Indicateurs patrimoniaux" className="grid grid-cols-2 gap-[var(--dash-gap)] xl:grid-cols-4">
        <AmountKpi m={kpis.totalActifs} context={ctx} />
        <AmountKpi m={kpis.totalPassifs} context={ctx} />
        <AmountKpi m={kpis.capitauxPropres} context={ctx} />
        <RatioKpi m={kpis.ratioEndettement} context={ctx} />
      </section>

      <div className="grid gap-[var(--dash-gap)] xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Card className="rounded-[var(--dash-radius)] p-[var(--dash-pad)]">
          <SectionHead title="Actifs vs Passifs" meta={`Consolidé · ${period.cumulativeLabel}`}>
            <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-1" aria-hidden />Total des actifs</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[var(--chart-liability)]" aria-hidden />Total des passifs</span>
            </div>
          </SectionHead>
          <BarChart
            label="Total des actifs et des passifs en fin de mois, 2024 (données fictives)"
            categories={period.months}
            fullCategories={period.monthsLong}
            series={[
              { key: "a", label: "Actifs", color: "var(--chart-1)", values: model.monthlyBalance.actifs.map(plotValue), labels: model.monthlyBalance.actifs.map((v) => euros(v)) },
              { key: "p", label: "Passifs", color: "var(--chart-liability)", values: model.monthlyBalance.passifs.map(plotValue), labels: model.monthlyBalance.passifs.map((v) => euros(v)) },
            ]}
            max={max}
            ticks={[0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000]}
            tickFormat="meur"
            height={236}
            maxBarWidth={13}
          />
        </Card>
        <Card className="rounded-[var(--dash-radius)] p-[var(--dash-pad)]">
          <SectionHead title="Répartition des actifs" meta={`Consolidé · ${period.closingLabel}`} />
          <div className="pt-2">
            <DonutChart
              label="Répartition des actifs consolidés (données fictives)"
              centerValue={compactEuros(model.assets.total)}
              centerLabel="Total des actifs"
              size={150}
              thickness={20}
              showValues={false}
              slices={model.assets.rows.map((r, i) => ({ label: r.label, value: plotValue(r.amount), color: CAT[i], shareLabel: percent(r.share) }))}
            />
          </div>
        </Card>
      </div>

      <Card className="rounded-[var(--dash-radius)] p-0">
        <div className="px-[var(--dash-pad)] pt-[var(--dash-pad)]">
          <SectionHead title="Analyse par entité" meta={`Comptes sociaux au ${period.closingLongLabel}`} />
        </div>
        <Table className="min-w-[880px] text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>Entité</TableHead>
              <TableHead className="text-right">Total actifs</TableHead>
              <TableHead className="text-right">Total passifs</TableHead>
              <TableHead className="text-right">Capitaux propres</TableHead>
              <TableHead className="text-right">Fonds de roulement</TableHead>
              <TableHead className="text-right">Ratio de liquidité</TableHead>
              <TableHead className="w-[19%]">Ratio d&apos;endettement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.entities.map((e) => {
              const selected = model.scope === e.id;
              return (
                <TableRow key={e.id} data-selected={selected || undefined} className={cn(selected && "bg-accent/60 hover:bg-accent/60")}>
                  <TableCell className="py-2.5 font-medium">
                    {e.name}
                    {selected ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">Sélectionnée</span> : null}
                  </TableCell>
                  <TableCell num className="py-2.5">{euros(e.actifs)}</TableCell>
                  <TableCell num className="py-2.5">{euros(e.passifs)}</TableCell>
                  <TableCell num className="py-2.5 font-medium">{euros(e.capitaux)}</TableCell>
                  <TableCell num className="py-2.5">{euros(e.fondsRoulement)}</TableCell>
                  <TableCell num className="py-2.5">{e.liquidite}</TableCell>
                  <TableCell className="py-2.5">
                    <span className="flex items-center gap-2.5">
                      <ShareBar value={share(e.ratioEndettement)} className="flex-1" tone={share(e.ratioEndettement) > 65 ? "warning" : "primary"} />
                      <span className="num w-12 text-right text-[12px]">{percent(e.ratioEndettement)}</span>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="border-t px-[var(--dash-pad)] py-2.5 text-[11.5px] text-muted-foreground">
          Comptes sociaux avant éliminations de consolidation : leur somme ne correspond pas au bilan consolidé.
        </p>
      </Card>

      <Card className="rounded-[var(--dash-radius)] p-0">
        <div className="px-[var(--dash-pad)] pt-[var(--dash-pad)]">
          <SectionHead title="Détail des postes du bilan consolidé" meta={`${period.closingLabel} vs ${period.previousClosingLabel}`} />
        </div>
        <Tabs
          label="Postes du bilan"
          value={tab}
          onChange={setTab}
          className="[&>[role=tablist]]:ml-[var(--dash-pad)]"
          tabs={[{ key: "actifs", label: "Actifs" }, { key: "passifs", label: "Passifs" }, { key: "capitaux", label: "Capitaux propres" }]}
        >
          <DetailTable rows={detail.rows} total={detail.total} totalN1={detail.totalN1} totalVariation={detail.totalVariation} nLabel={period.closingLabel} n1Label={period.previousClosingLabel} />
        </Tabs>
      </Card>
    </div>
  );
}
