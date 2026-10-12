import { ChevronDown, Landmark, PieChart, Scale, Wallet } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHS, MONTHS_FULL, type DashboardData } from "@/features/design-preview/demo-data";
import { cn } from "@/lib/utils";
import { BalanceDetail } from "./balance-detail";
import { direction, eur, meur, pct, pts, signedPct } from "./format";

/** Liste déroulante de la maquette : affichée, inactive (aucune fausse fonctionnalité). */
export function StaticSelect({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span title="Maquette : filtre inactif" className={cn("inline-flex h-10 items-center gap-6 whitespace-nowrap rounded-xl border bg-card px-3.5 text-[13.5px] text-foreground", className)}>
      {children}
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
    </span>
  );
}

function InlineBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span className="relative block h-2.5 w-full min-w-10 overflow-hidden rounded-[3px] bg-surface-2" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color }} />
    </span>
  );
}

function RatioTrack({ value, max, color }: { value: number; max: number; color: string }) {
  const p = Math.min(100, (value / max) * 100);
  return (
    <span className="relative block h-1.5 w-full min-w-12 rounded-full bg-surface-2" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: `${p}%`, background: color }} />
      <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style={{ left: `${p}%`, background: color }} />
    </span>
  );
}

/**
 * MODE « ANALYSE FINANCIÈRE » — densité analytique : structure du bilan, comparaisons,
 * analyse par entité et détail des postes. Données : `DashboardData` (source unique).
 */
export function AnalyseDashboard({ data }: { data: DashboardData }) {
  const b = data.balance;
  const m = b.monthly;
  const maxAssets = Math.max(...b.entities.map((e) => e.assets));
  const maxLiab = Math.max(...b.entities.map((e) => e.liabilities));
  const maxEq = Math.max(...b.entities.map((e) => e.equity));
  const maxWc = Math.max(...b.entities.map((e) => e.workingCapital));
  const assetsDonut = [
    { label: "Actifs immobilisés", value: b.assets[0].current, color: "var(--series-blue)" },
    { label: "Stocks et créances clients", value: b.assets[1].current + b.assets[2].current, color: "var(--series-orange)" },
    { label: "Trésorerie", value: b.assets[3].current, color: "var(--series-green)" },
    { label: "Autres actifs", value: b.assets[4].current, color: "var(--series-neutral)" },
  ];

  return (
    <div className="space-y-4" data-testid="dashboard-analyse">
      <section aria-label="Indicateurs patrimoniaux" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Landmark />} iconTone="blue" label="Total des actifs" value={eur(b.totalAssets)}
          delta={{ tone: "favorable", direction: direction(b.change.assets), label: signedPct(b.change.assets) }} note="vs période précédente"
          sparkline={<Sparkline id="sp-a1" values={m.assets} color="var(--series-blue)" />} />
        <KpiCard icon={<Wallet />} iconTone="red" label="Total des passifs" value={eur(b.totalLiabilities)}
          delta={{ tone: "defavorable", direction: direction(b.change.liabilities), label: signedPct(b.change.liabilities) }} note="vs période précédente"
          sparkline={<Sparkline id="sp-a2" values={m.liabilities} color="var(--series-red)" />} />
        <KpiCard icon={<PieChart />} iconTone="green" label="Capitaux propres" value={eur(b.equity)}
          delta={{ tone: "favorable", direction: direction(b.change.equity), label: signedPct(b.change.equity) }} note="vs période précédente"
          sparkline={<Sparkline id="sp-a3" values={m.equity} color="var(--series-green)" />} />
        <KpiCard icon={<Scale />} iconTone="violet" label="Ratio d'endettement" value={pct(b.gearing)}
          delta={{ tone: b.change.gearingPts < 0 ? "favorable" : "defavorable", direction: direction(b.change.gearingPts), label: pts(b.change.gearingPts) }} note="vs période précédente"
          sparkline={<Sparkline id="sp-a4" values={m.gearing} color="#6a5cd9" />} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-6">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[21px] font-semibold tracking-[-0.01em]">Actifs vs Passifs</h2>
              <div className="mt-2 flex flex-wrap gap-5 text-[13px] text-muted-foreground">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-series-blue" aria-hidden />Total des actifs</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-series-red" aria-hidden />Total des passifs</span>
              </div>
            </div>
            <StaticSelect>Mensuel</StaticSelect>
          </div>
          <BarChart
            label="Total des actifs et des passifs, mensuel (données fictives)"
            categories={MONTHS} fullCategories={MONTHS_FULL}
            series={[
              { key: "a", label: "Actifs", color: "var(--series-blue)", values: m.assets },
              { key: "p", label: "Passifs", color: "var(--series-red)", values: m.liabilities },
            ]}
            max={5_000_000} ticks={[0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000]}
            tickFormat="meur" valueFormat="eur" height={248} barStyle="soft" maxBarWidth={18}
          />
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 className="text-[21px] font-semibold tracking-[-0.01em]">Répartition des actifs</h2>
            <StaticSelect>Par catégorie</StaticSelect>
          </div>
          <DonutChart label="Répartition des actifs par catégorie (données fictives)" slices={assetsDonut}
            centerValue={meur(b.totalAssets)} centerLabel="Total des actifs" size={176} thickness={30} legend="detailed" formatAmount="eur" />
        </Card>
      </div>

      <Card>
        <h2 className="px-5 pb-3 pt-5 text-[21px] font-semibold tracking-[-0.01em] sm:px-6">Analyse par entité</h2>
        <Table className="min-w-[980px] [&_td]:whitespace-nowrap">
          <TableHeader>
            <TableRow className="border-t bg-surface-2/50">
              <TableHead>Entité</TableHead>
              <TableHead>Total des actifs</TableHead>
              <TableHead>Total des passifs</TableHead>
              <TableHead>Capitaux propres</TableHead>
              <TableHead>Fonds de roulement</TableHead>
              <TableHead>Ratio de liquidité</TableHead>
              <TableHead>Ratio d&apos;endettement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.entities.map((e, i) => (
              <TableRow key={e.name}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <span className="num grid size-6 place-items-center rounded-full border text-[11.5px] text-muted-foreground">{i + 1}</span>
                    <span className="font-medium">{e.name}</span>
                  </span>
                </TableCell>
                <TableCell><span className="grid grid-cols-[84px_1fr] items-center gap-2.5"><span className="num text-right">{eur(e.assets)}</span><InlineBar value={e.assets} max={maxAssets} color="var(--series-blue)" /></span></TableCell>
                <TableCell><span className="grid grid-cols-[84px_1fr] items-center gap-2.5"><span className="num text-right">{eur(e.liabilities)}</span><InlineBar value={e.liabilities} max={maxLiab} color="var(--series-red)" /></span></TableCell>
                <TableCell><span className="grid grid-cols-[84px_1fr] items-center gap-2.5"><span className="num text-right">{eur(e.equity)}</span><InlineBar value={e.equity} max={maxEq} color="var(--series-green)" /></span></TableCell>
                <TableCell><span className="grid grid-cols-[84px_1fr] items-center gap-2.5"><span className="num text-right">{eur(e.workingCapital)}</span><InlineBar value={e.workingCapital} max={maxWc} color="var(--series-blue)" /></span></TableCell>
                <TableCell><span className="grid grid-cols-[60px_1fr] items-center gap-2.5"><span className="num text-right">{pct(e.liquidity)}</span><RatioTrack value={e.liquidity} max={2} color="var(--series-blue)" /></span></TableCell>
                <TableCell><span className="grid grid-cols-[52px_1fr] items-center gap-2.5"><span className="num text-right">{pct(e.debtRatio)}</span><RatioTrack value={e.debtRatio} max={1} color="var(--series-blue)" /></span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <BalanceDetail data={data} />
    </div>
  );
}
