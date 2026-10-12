import {
  ArrowRight, Banknote, CalendarRange, CreditCard, Eye, FileText, Landmark, Percent, Receipt, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui/card";
import { DeltaBadge, IconTile, KpiCard } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHS, MONTHS_FULL, type DashboardData } from "@/features/design-preview/demo-data";
import { cn } from "@/lib/utils";
import { StaticSelect } from "./analyse-dashboard";
import { direction, eur, meur, pct, pts, signedEur, signedPct } from "./format";

/** Bouton de la maquette : affiché pour la composition, désactivé (aucune action fictive). */
function MockButton({ primary, icon, children }: { primary?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" disabled title="Maquette : action non disponible"
      className={cn("inline-flex h-11 cursor-not-allowed items-center gap-2.5 rounded-xl px-4 text-[14px] font-medium [&_svg]:size-4",
        primary ? "bg-primary text-primary-foreground shadow-card" : "border bg-card text-foreground")}>
      {icon}{children}
    </button>
  );
}

const CATEGORY_TINTS: Record<string, string> = {
  Vente: "bg-success-surface text-success-text",
  "Équipement": "bg-info-surface text-info-text",
  "Ressources humaines": "bg-[color-mix(in_oklab,#6a5cd9_12%,transparent)] text-[#5a4cc4] dark:text-[#b3a8f0]",
  "Fiscalité": "bg-warning-surface text-warning-text",
  Logiciels: "bg-surface-2 text-muted-foreground",
};
const METHOD_ICONS: Record<string, typeof Landmark> = { Virement: Landmark, "Carte entreprise": CreditCard, "Prélèvement": Receipt };

/**
 * MODE « PILOTAGE FINANCIER » — décisions quotidiennes : trésorerie et résultat en grandes cartes,
 * indicateurs d'exploitation, évolution, charges et opérations récentes. Données : `DashboardData`.
 */
export function PilotageDashboard({ data }: { data: DashboardData }) {
  const p = data.performance;
  const m = p.monthly;
  const cash6 = m.cash.slice(6);
  const cashMax = Math.max(...cash6);
  const expenseColors = ["var(--series-blue)", "var(--series-green)", "var(--series-orange)", "var(--series-neutral)"];

  return (
    <div className="space-y-5" data-testid="dashboard-pilotage">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Trésorerie disponible : carte principale. */}
        <Card className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)] sm:p-7">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <IconTile tone="blue"><Banknote /></IconTile>
                <p className="font-display text-[19px] font-medium">Trésorerie disponible</p>
              </div>
              <p className="mt-5 flex items-center gap-3">
                <span className="figure text-[44px] sm:text-[52px]">{eur(p.cash)}</span>
                <Eye className="size-5 text-muted-foreground" aria-hidden />
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <DeltaBadge tone="favorable" direction={direction(p.cashChange)}>{signedPct(p.cashChange)}</DeltaBadge>
                <span className="text-[13.5px] text-muted-foreground">vs juin 2026</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <MockButton primary icon={<ArrowRight />}>Voir la trésorerie</MockButton>
              <MockButton icon={<CalendarRange />}>Prévisions 90 jours</MockButton>
            </div>
          </div>
          <div className="flex min-h-[170px] items-end gap-2.5" aria-hidden>
            {cash6.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="w-full max-w-8 rounded-t-[6px] bg-gradient-to-b from-series-blue/75 to-series-blue/15" style={{ height: `${(v / cashMax) * 85}%` }} />
                <span className="text-[11.5px] text-muted-foreground">{MONTHS[6 + i]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Résultat net : surface verte douce. */}
        <Card className="relative overflow-hidden border-transparent bg-pastel-green p-6 shadow-none sm:p-7 dark:border-border">
          <TrendingUp aria-hidden className="pointer-events-none absolute -right-6 -top-4 size-48 text-success/10" strokeWidth={1.2} />
          <div className="relative flex items-center gap-3">
            <IconTile tone="green"><Wallet /></IconTile>
            <span className="rounded-full bg-[#0f5e44] px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white dark:bg-success/30">Priorité</span>
          </div>
          <p className="relative mt-5 font-display text-[17px] text-foreground">Résultat net (cumulé)</p>
          <div className="relative mt-2 flex flex-wrap items-center gap-3">
            <span className="figure text-[42px] sm:text-[48px]">{eur(p.netResult)}</span>
            <DeltaBadge tone={p.lastMonthResultChange >= 0 ? "favorable" : "defavorable"} direction={direction(p.lastMonthResultChange)} className="bg-card/80">{signedPct(p.lastMonthResultChange)} ce mois-ci</DeltaBadge>
          </div>
          <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-card/75 p-4 dark:bg-card/60">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Percent className="size-4" aria-hidden />Marge nette</p>
              <p className="mt-2 flex items-baseline justify-between gap-2">
                <span className="figure text-[24px]">{pct(p.netMargin)}</span>
                <span className="num text-[13px] font-semibold text-success-text">{pts(p.netMarginPrevPts)}</span>
              </p>
            </div>
            <div className="rounded-xl bg-card/75 p-4 dark:bg-card/60">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Target className="size-4" aria-hidden />Objectif annuel</p>
              <p className="mt-2 flex items-baseline justify-between gap-2">
                <span className="figure text-[24px]">{eur(p.targetResult)}</span>
                <span className="num text-[13px] font-semibold">{pct(p.targetProgress)}</span>
              </p>
              <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-success/15" aria-hidden>
                <span className="block h-full rounded-full bg-series-green" style={{ width: `${Math.min(100, p.targetProgress * 100)}%` }} />
              </span>
            </div>
          </div>
        </Card>
      </div>

      <section aria-label="Indicateurs d'exploitation" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard variant="pilotage" icon={<TrendingUp />} iconTone="blue" label="Chiffre d'affaires" value={eur(p.revenue)}
          delta={{ tone: "favorable", direction: direction(p.revenue - p.revenuePrev), label: signedPct(p.revenue / p.revenuePrev - 1) }} note="vs période précédente"
          sparkline={<Sparkline id="sp-b1" values={m.revenue} color="var(--series-blue)" />} />
        <KpiCard variant="pilotage" icon={<FileText />} iconTone="green" label="Charges d'exploitation" value={eur(p.expenses)}
          delta={{ tone: "defavorable", direction: direction(p.expenses - p.expensesPrev), label: signedPct(p.expenses / p.expensesPrev - 1) }} note="vs période précédente"
          sparkline={<Sparkline id="sp-b2" values={m.expenses} color="var(--series-green)" />} />
        <KpiCard variant="pilotage" icon={<Users />} iconTone="blue" label="Créances clients" value={eur(p.receivables)}
          delta={{ tone: "defavorable", direction: direction(p.receivablesChange), label: signedPct(p.receivablesChange) }} note="depuis janvier"
          sparkline={<Sparkline id="sp-b3" values={m.receivables} color="var(--series-blue)" />} />
        <KpiCard variant="pilotage" icon={<Receipt />} iconTone="red" label="Dettes fournisseurs" value={eur(p.payables)}
          delta={{ tone: "neutre", direction: direction(p.payablesChange), label: signedPct(p.payablesChange) }} note="depuis janvier"
          sparkline={<Sparkline id="sp-b4" values={m.payables} color="var(--series-red)" />} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[21px] font-semibold tracking-[-0.01em]">Évolution du chiffre d&apos;affaires et du résultat</h2>
              <div className="mt-2 flex flex-wrap gap-5 text-[13px] text-muted-foreground">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-series-blue" aria-hidden />Chiffre d&apos;affaires</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-series-green" aria-hidden />Résultat net cumulé</span>
              </div>
            </div>
            <StaticSelect>Mensuel</StaticSelect>
          </div>
          <BarChart
            label="Chiffre d'affaires mensuel et résultat net cumulé (données fictives)"
            categories={MONTHS} fullCategories={MONTHS_FULL}
            series={[{ key: "ca", label: "CA", color: "var(--series-blue)", values: m.revenue }]}
            lines={[{ key: "rn", label: "Résultat net cumulé", color: "var(--series-green)", values: m.cumulativeResult }]}
            max={200_000} ticks={[0, 50_000, 100_000, 150_000, 200_000]} tickFormat="keur" valueFormat="eur" height={232} barStyle="soft" maxBarWidth={30}
          />
        </Card>
        <Card className="p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 className="text-[21px] font-semibold tracking-[-0.01em]">Répartition des charges</h2>
            <StaticSelect>Par catégorie</StaticSelect>
          </div>
          <DonutChart label="Répartition des charges d'exploitation (données fictives)"
            slices={p.expenseBreakdown.map((e, i) => ({ ...e, color: expenseColors[i] }))}
            centerValue={meur(p.expenses)} centerLabel="Total" size={168} thickness={28} legend="detailed" formatAmount="eur" />
        </Card>
      </div>

      <Card>
        <h2 className="px-6 pb-3 pt-6 text-[21px] font-semibold tracking-[-0.01em]">Dernières opérations</h2>
        <Table className="min-w-[900px] [&_td]:whitespace-nowrap">
          <TableHeader>
            <TableRow className="border-t bg-surface-2/50">
              <TableHead>Date</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="pl-8">Statut</TableHead>
              <TableHead>Méthode</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.operations.map((o) => {
              const Method = METHOD_ICONS[o.method] ?? Landmark;
              return (
                <TableRow key={`${o.date}-${o.label}`}>
                  <TableCell className="num text-muted-foreground">{o.date}</TableCell>
                  <TableCell className="font-medium">{o.label}</TableCell>
                  <TableCell><span className={cn("inline-flex h-6 items-center rounded-md px-2 text-[12.5px] font-medium", CATEGORY_TINTS[o.category])}>{o.category}</span></TableCell>
                  <TableCell num className={cn("font-semibold", o.amount > 0 ? "text-success-text" : "text-foreground")}>{signedEur(o.amount)}</TableCell>
                  <TableCell className="pl-8">
                    <span className="flex items-center gap-2"><span aria-hidden className={cn("size-2 rounded-full", o.status === "Payée" ? "bg-series-green" : "bg-series-blue")} />{o.status}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground"><span className="flex items-center gap-2"><Method className="size-4" strokeWidth={1.6} aria-hidden />{o.method}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
