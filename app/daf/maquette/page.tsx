import { BarChart3, CalendarDays, ChartColumnIncreasing, Download, FileText, Folder, TrendingUp, Upload, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/app-shell";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DEMO_ACTIVITY, DEMO_CA, DEMO_KPIS, DEMO_MONTHS, DEMO_MONTHS_FULL, DEMO_PERIOD, DEMO_RESULTAT, DEMO_SIZES,
} from "@/features/design-preview/demo-data";
import { requireStaff } from "@/lib/guards";

export const metadata: Metadata = { title: "Maquette du tableau de bord" };

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const ICONS = { file: FileText, upload: Upload, chart: ChartColumnIncreasing, download: Download } as const;
const STATUS_VARIANT = { "Traité": "success", "À valider": "info", "Publié": "success", "Validé": "success" } as const;

/**
 * MAQUETTE DE CONCEPTION — tableau de bord financier (Phase 4 non développée).
 * Accessible uniquement si DESIGN_PREVIEW=1 (jamais en production) et au personnel du cabinet.
 * Toutes les valeurs sont fictives (features/design-preview/demo-data.ts).
 */
export default async function DashboardMockupPage() {
  if (process.env.DESIGN_PREVIEW !== "1") notFound();
  const actor = await requireStaff();
  const firstName = actor.fullName.split(/\s+/)[0];

  return (
    <>
      <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning-surface px-3 py-1 text-[12.5px] font-medium text-warning-text" data-testid="demo-banner">
        Maquette de conception · données fictives, non issues de l&apos;application
      </p>
      <PageHeader
        eyebrow={`Bonjour ${firstName},`}
        title="Vue d'ensemble financière"
        description="Suivez la performance de votre portefeuille et pilotez votre activité."
        actions={
          <span className="inline-flex h-11 items-center gap-3 rounded-xl border bg-card px-4 text-[14.5px] text-foreground shadow-card">
            <CalendarDays className="size-[18px] text-muted-foreground" strokeWidth={1.6} aria-hidden />
            {DEMO_PERIOD}
          </span>
        }
      />

      <section aria-label="Indicateurs clés" className="mb-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<BarChart3 />} label="Chiffre d'affaires" value={eur.format(DEMO_KPIS.ca.value)}
          delta={{ tone: "favorable", label: DEMO_KPIS.ca.delta }}
          comparison={{ tone: "favorable", amount: DEMO_KPIS.ca.diff, text: "par rapport à la période précédente" }} />
        <KpiCard icon={<Wallet />} label="Trésorerie" value={eur.format(DEMO_KPIS.tresorerie.value)}
          delta={{ tone: "favorable", label: DEMO_KPIS.tresorerie.delta }}
          comparison={{ tone: "favorable", amount: DEMO_KPIS.tresorerie.diff, text: "par rapport au mois dernier" }} />
        <KpiCard icon={<TrendingUp />} label="Résultat net" value={eur.format(DEMO_KPIS.resultat.value)}
          delta={{ tone: "defavorable", label: DEMO_KPIS.resultat.delta }}
          comparison={{ tone: "defavorable", amount: DEMO_KPIS.resultat.diff, text: "par rapport au mois dernier" }} />
        <KpiCard icon={<Folder />} label="Dossiers actifs" value={DEMO_KPIS.dossiers.value}
          delta={{ tone: "neutre", label: DEMO_KPIS.dossiers.delta }}
          comparison={{ tone: "neutre", amount: `sur ${DEMO_KPIS.dossiers.total}`, text: "clients au total" }} />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Évolution du chiffre d&apos;affaires et du résultat net</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-chart-1" aria-hidden />Chiffre d&apos;affaires</span>
              <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-chart-2" aria-hidden />Résultat net</span>
              <span className="inline-flex h-9 items-center rounded-lg border px-3 text-foreground" title="Sélecteur de période (maquette, inactif)">Mensuel</span>
            </div>
          </div>
          <BarChart
            label="Chiffre d'affaires et résultat net mensuels (données fictives)"
            categories={DEMO_MONTHS}
            fullCategories={DEMO_MONTHS_FULL}
            series={[
              { key: "ca", label: "CA", color: "var(--chart-1)", values: DEMO_CA },
              { key: "rn", label: "Résultat net", color: "var(--chart-2)", values: DEMO_RESULTAT },
            ]}
            max={400_000}
            ticks={[0, 100_000, 200_000, 300_000, 400_000]}
            tickFormat="keur"
            valueFormat="eur"
            height={250}
          />
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-6 text-[17px] font-semibold tracking-[-0.01em]">Répartition des clients</h2>
          <DonutChart
            label="Répartition des clients par taille (données fictives)"
            centerValue={String(DEMO_SIZES.reduce((s, x) => s + x.value, 0))}
            centerLabel="clients"
            size={136}
            thickness={22}
            slices={DEMO_SIZES.map((s, i) => ({ ...s, color: `var(--chart-seq-${i + 1})` }))}
          />
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Dernières activités</h2>
        </div>
        <ul className="divide-y border-t md:hidden">
          {DEMO_ACTIVITY.map((a) => (
            <li key={`m-${a.date}-${a.item}`} className="flex items-start justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="font-medium">{a.item}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{a.client} · {a.date} · {a.user}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={STATUS_VARIANT[a.status]} className="rounded-full px-2.5">{a.status}</Badge>
                {a.amount ? <span className="num text-[13px] font-medium">{a.amount}</span> : null}
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden px-3 pb-3 sm:px-4 sm:pb-4 md:block">
          <Table className="min-w-[860px] [&_td]:whitespace-nowrap [&_th]:bg-surface-2/70 [&_th:first-child]:rounded-l-lg [&_th:last-child]:rounded-r-lg">
            <TableHeader>
              <TableRow className="border-0">
                <TableHead>Date</TableHead>
                <TableHead>Élément</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="pl-8">Statut</TableHead>
                <TableHead>Utilisateur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_ACTIVITY.map((a) => {
                const Icon = ICONS[a.icon];
                return (
                  <TableRow key={`${a.date}-${a.item}`}>
                    <TableCell className="num text-muted-foreground">{a.date}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2.5"><Icon className="size-[18px] text-muted-foreground" strokeWidth={1.6} aria-hidden />{a.item}</span>
                    </TableCell>
                    <TableCell>{a.client}</TableCell>
                    <TableCell num>{a.amount ?? <span className="text-subtle-foreground">—</span>}</TableCell>
                    <TableCell className="pl-8"><Badge variant={STATUS_VARIANT[a.status]} className="rounded-full px-2.5">{a.status}</Badge></TableCell>
                    <TableCell>{a.user}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
