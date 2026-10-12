"use client";

import { ArrowDownLeft, ArrowUpRight, BarChart3, FileText, Receipt, Target, Truck, Wallet } from "lucide-react";
import type * as React from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { MiniBars } from "@/components/charts/mini-bars";
import { compactEuros, euros, percent, plotValue, points } from "@/components/finance/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DeltaBadge } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InterfaceModeShortcut } from "@/features/interface-mode/controls";
import { cn } from "@/lib/utils";
import type { AmountMetric, DashboardModel, Scope } from "./model";
import { PeriodChip } from "./controls";

const CAT = ["var(--chart-cat-1)", "var(--chart-cat-2)", "var(--chart-cat-3)", "var(--chart-cat-4)", "var(--chart-cat-5)"];
const STATUS = { "Rapprochée": "success", "Validée": "default", "À valider": "warning" } as const;

function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return <Card className={cn("rounded-[var(--dash-radius)] border-border/70 p-[var(--dash-pad)] shadow-[0_1px_2px_rgb(25_37_54/0.04),0_8px_24px_-12px_rgb(25_37_54/0.08)]", className)} {...props} />;
}

function Kpi({ m, icon, context }: { m: AmountMetric; icon: React.ReactNode; context: string }) {
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-6" data-kpi={m.key}>
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full sm:size-9 bg-accent text-primary dark:text-info-text [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">{icon}</span>
        <p className="text-[13px] font-medium leading-tight text-muted-foreground sm:text-[14px]">{m.label}</p>
      </div>
      <p className="font-editorial text-[22px] font-medium leading-none tracking-[-0.01em] sm:text-[30px]">{euros(m.value)}</p>
      <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
        {m.variation ? <DeltaBadge tone={m.tone}>{percent(m.variation.percent, { signed: true })}</DeltaBadge> : null}
        {context}
      </p>
    </Panel>
  );
}

/**
 * MODE PILOTAGE : lecture éditoriale et hiérarchisée. Deux grandes cartes (trésorerie, résultat
 * prioritaire) en tête, indicateurs d'activité, évolution et répartition, puis opérations.
 */
export function PilotageDashboard({ model, firstName, onScopeChange }: { model: DashboardModel; firstName: string; onScopeChange: (s: Scope) => void }) {
  const { activity: act, period } = model;
  const r = act.resultatNet;
  const tr = act.tresorerie;
  const ctxYear = `vs ${period.fiscalYear - 1}`;
  const progress = r.targetProgress ? Math.min(100, Number(r.targetProgress.replace(",", "."))) : 0;
  return (
    <div className="space-y-[var(--dash-gap)]">
      <header className="flex flex-col gap-5 pb-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-editorial text-[38px] font-normal leading-[1.05] tracking-[-0.02em] sm:text-[48px]">Bonjour {firstName},</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">Voici l&apos;essentiel de votre pilotage financier pour l&apos;exercice {period.fiscalYear}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodChip label={period.cumulativeLabel} title="Cumul de l'exercice (maquette : un seul exercice disponible)" />
          <InterfaceModeShortcut />
        </div>
      </header>

      {model.scope !== "all" ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-info/30 bg-info-surface px-5 py-3 text-[13.5px] text-info-text">
          <span>
            Périmètre conservé : <strong className="font-semibold">{model.scopeLabel}</strong>. La maquette du mode Pilotage ne présente que le groupe : les chiffres ci-dessous sont consolidés.
          </span>
          <button type="button" onClick={() => onScopeChange("all")} className="rounded-md font-medium underline underline-offset-4">Afficher toutes les entités</button>
        </div>
      ) : null}

      <div className="grid gap-[var(--dash-gap)] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel className="flex flex-col justify-between gap-6 bg-[var(--pilot-hero)] sm:p-8" data-kpi="tresorerie">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[14.5px] font-medium text-muted-foreground">
              <Wallet className="size-[18px]" strokeWidth={1.75} aria-hidden /> {tr.label}
            </p>
            <span className="text-[12.5px] text-muted-foreground">Au {period.closingLongLabel}</span>
          </div>
          <div className="grid items-end gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
            <div>
              <p className="font-editorial text-[46px] font-normal leading-none tracking-[-0.02em] sm:text-[60px]">{euros(tr.value)}</p>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {tr.variation ? <DeltaBadge tone={tr.tone}>{percent(tr.variation.percent, { signed: true })}</DeltaBadge> : null}
                {tr.variation ? <span><span className="num font-medium text-foreground">{euros(tr.variation.amount, { signed: true })}</span> vs {period.previousMonthLabel}</span> : null}
              </p>
            </div>
            <MiniBars
              label="Trésorerie disponible en fin de mois (données fictives)"
              height={128}
              items={tr.months.map((m) => ({ label: m.label, longLabel: m.longLabel, value: plotValue(m.value), display: euros(m.value) }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2.5 border-t pt-5">
            <button type="button" disabled aria-describedby="tresorerie-phase" className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13.5px] font-medium text-primary-foreground opacity-50">Voir la trésorerie</button>
            <button type="button" disabled aria-describedby="tresorerie-phase" className="inline-flex h-10 items-center rounded-full border px-5 text-[13.5px] font-medium opacity-60">Prévisions 90 jours</button>
            <span id="tresorerie-phase" className="text-[12px] text-muted-foreground">Module Trésorerie prévu en phase 5b</span>
          </div>
        </Panel>

        <Panel className="flex flex-col gap-6 border-[var(--pilot-positive-border)] bg-[var(--pilot-positive)] sm:p-8" data-kpi="resultat">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14.5px] font-medium text-[var(--pilot-positive-ink)]">Résultat net (cumulé)</p>
            <span className="rounded-full bg-[var(--pilot-positive-ink)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--pilot-positive)]">Priorité</span>
          </div>
          <div>
            <p className="font-editorial text-[44px] font-normal leading-none tracking-[-0.02em] text-[var(--pilot-positive-ink)] sm:text-[52px]">{euros(r.value)}</p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-[var(--pilot-positive-ink)]/80">
              {r.monthVariation ? <DeltaBadge tone={r.tone}>{percent(r.monthVariation.percent, { signed: true })}</DeltaBadge> : null}
              ce mois-ci
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-[var(--pilot-positive-border)] pt-5">
            <div>
              <dt className="text-[12.5px] text-[var(--pilot-positive-ink)]/75">Marge nette</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="font-editorial text-[26px] text-[var(--pilot-positive-ink)]">{percent(r.marge)}</span>
                <span className="num text-[12.5px] font-medium text-success-text">{points(r.margeDeltaPoints)}</span>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[12.5px] text-[var(--pilot-positive-ink)]/75"><Target className="size-3.5" aria-hidden />Objectif annuel (fictif)</dt>
              <dd className="mt-1 font-editorial text-[26px] text-[var(--pilot-positive-ink)]">{euros(r.target)}</dd>
            </div>
          </dl>
          <div>
            <div className="mb-2 flex justify-between text-[12.5px] text-[var(--pilot-positive-ink)]/80">
              <span>Progression vers l&apos;objectif</span>
              <span className="num font-semibold">{percent(r.targetProgress)}</span>
            </div>
            <div role="progressbar" aria-label="Progression vers l'objectif annuel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={percent(r.targetProgress)} className="h-2.5 overflow-hidden rounded-full bg-[var(--pilot-positive-border)]">
              <span className="block h-full rounded-full bg-success" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </Panel>
      </div>

      <section aria-label="Indicateurs d'activité" className="grid grid-cols-2 gap-3 sm:gap-[var(--dash-gap)] xl:grid-cols-4">
        <Kpi m={act.chiffreAffaires} icon={<BarChart3 />} context={ctxYear} />
        <Kpi m={act.charges} icon={<Receipt />} context={ctxYear} />
        <Kpi m={act.creancesClients} icon={<FileText />} context={`vs ${period.previousClosingLabel}`} />
        <Kpi m={act.dettesFournisseurs} icon={<Truck />} context={`vs ${period.previousClosingLabel}`} />
      </section>

      <div className="grid gap-[var(--dash-gap)] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-editorial text-[22px] font-medium tracking-[-0.01em]">Évolution du chiffre d&apos;affaires et du résultat</h2>
            <div className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
              <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-chart-1" aria-hidden />Chiffre d&apos;affaires</span>
              <span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded bg-[var(--chart-cat-3)]" aria-hidden />Résultat net (échelle de droite)</span>
            </div>
          </div>
          <BarChart
            label="Chiffre d'affaires et résultat net mensuels, 2024 (données fictives)"
            categories={period.months}
            fullCategories={period.monthsLong}
            series={[{ key: "ca", label: "Chiffre d'affaires", color: "var(--chart-1)", values: act.monthly.ca.map(plotValue), labels: act.monthly.ca.map((v) => euros(v)) }]}
            lines={[{ key: "rn", label: "Résultat net", color: "var(--chart-cat-3)", values: act.monthly.resultat.map(plotValue), labels: act.monthly.resultat.map((v) => euros(v)) }]}
            max={150_000}
            ticks={[0, 50_000, 100_000, 150_000]}
            lineAxis={{ max: 30_000, ticks: [0, 10_000, 20_000, 30_000] }}
            tickFormat="keur"
            height={268}
            maxBarWidth={22}
          />
        </Panel>
        <Panel>
          <h2 className="mb-6 font-editorial text-[22px] font-medium tracking-[-0.01em]">Répartition des charges</h2>
          <DonutChart
            label="Répartition des charges d'exploitation (données fictives)"
            centerValue={compactEuros(act.chargesBreakdown.total)}
            centerLabel="Total des charges"
            size={164}
            thickness={16}
            showValues={false}
            layout="row"
            slices={act.chargesBreakdown.rows.map((c, i) => ({ label: c.label, value: plotValue(c.amount), color: CAT[i], shareLabel: percent(c.share) }))}
          />
        </Panel>
      </div>

      <Panel className="p-0 sm:p-0">
        <div className="flex items-center justify-between px-[var(--dash-pad)] pb-3 pt-[var(--dash-pad)]">
          <h2 className="font-editorial text-[22px] font-medium tracking-[-0.01em]">Dernières opérations</h2>
        </div>
        <ul className="divide-y border-t md:hidden">
          {model.operations.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="font-medium">{o.label}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{o.date} · {o.category}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={cn("num text-[13.5px] font-semibold", o.amount.startsWith("-") ? "text-foreground" : "text-success-text")}>{euros(o.amount, { signed: true })}</span>
                <Badge variant={STATUS[o.status]} className="rounded-full px-2.5">{o.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden px-3 pb-4 md:block">
          <Table className="min-w-[760px] [&_th]:bg-surface-2/60 [&_th:first-child]:rounded-l-lg [&_th:last-child]:rounded-r-lg">
            <TableHeader>
              <TableRow className="border-0">
                <TableHead>Date</TableHead>
                <TableHead>Opération</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="pl-8">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.operations.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="num py-3.5 text-muted-foreground">{o.date}</TableCell>
                  <TableCell className="py-3.5">
                    <span className="flex items-center gap-2.5">
                      {o.amount.startsWith("-")
                        ? <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden />
                        : <ArrowDownLeft className="size-4 text-success-text" aria-hidden />}
                      {o.label}
                    </span>
                  </TableCell>
                  <TableCell className="py-3.5 text-muted-foreground">{o.category}</TableCell>
                  <TableCell num className={cn("py-3.5 font-semibold", !o.amount.startsWith("-") && "text-success-text")}>{euros(o.amount, { signed: true })}</TableCell>
                  <TableCell className="py-3.5 pl-8"><Badge variant={STATUS[o.status]} className="rounded-full px-2.5">{o.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
