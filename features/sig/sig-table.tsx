import { ChevronRight, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SnapshotContent } from "@/domain/sig/report";
import { cn } from "@/lib/utils";
import { euro, shareOfRevenue, variationView } from "./format";

/**
 * Tableau des SIG (N, N-1, écarts, % du CA). Pour l'espace DAF, chaque ligne se déplie sur le
 * détail des comptes (règle appliquée, source, lignes du fichier ou écritures).
 */
export function SigTable({ content, detail, entriesHref }: {
  content: SnapshotContent;
  detail: boolean;
  /** Lien vers les écritures d'un compte (source FEC). */
  entriesHref?: (account: string) => string;
}) {
  const ca = content.rows.find((r) => r.code === "CHIFFRE_AFFAIRES")?.value ?? null;
  const hasPrev = content.comparison.available;
  return (
    <div>
      <Table data-testid="sig-table" className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-64">Rubrique</TableHead>
            <TableHead className="text-right">N</TableHead>
            <TableHead className="text-right">% CA</TableHead>
            <TableHead className="text-right">N-1</TableHead>
            <TableHead className="text-right">Écart</TableHead>
            <TableHead className="text-right">Écart %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {content.rows.map((r) => {
            const v = variationView(r.value, r.previous);
            const net = r.code === "RESULTAT_NET";
            const key = KEY_SOLDES.has(r.code);
            const solde = r.kind === "solde";
            return (
              <TableRow
                key={r.code}
                data-row={r.code}
                className={cn(
                  r.kind === "line" && "text-[13px]",
                  r.kind === "subtotal" && "font-medium",
                  solde && "border-t border-t-border-strong bg-surface-2/70 font-semibold hover:bg-surface-2",
                  key && "[&>td:first-child]:shadow-[inset_3px_0_0_var(--primary)]",
                  net && "bg-accent text-[15px] text-accent-foreground hover:bg-accent [&>td:first-child]:shadow-[inset_3px_0_0_var(--primary)]",
                )}
              >
                <TableCell style={{ paddingLeft: `${1 + r.level * 1.25}rem` }} className={cn(r.level === 2 && "text-muted-foreground")}>
                  {detail && r.kind === "line" && r.contributions.length > 0 ? (
                    <details className="group">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="size-3.5 shrink-0 text-subtle-foreground transition-transform group-open:rotate-90" aria-hidden />
                        {r.label} <span className="text-xs font-normal text-muted-foreground">({r.contributions.length} compte{r.contributions.length > 1 ? "s" : ""})</span>
                      </summary>
                      <Contributions row={r} entriesHref={entriesHref} />
                    </details>
                  ) : (
                    <span title={r.definition ?? undefined}>{r.label}</span>
                  )}
                </TableCell>
                <TableCell num data-testid={`sig-${r.code}`} className="align-top">{euro(r.value)}</TableCell>
                <TableCell num className="align-top text-muted-foreground">{shareOfRevenue(r.value, ca) ?? "—"}</TableCell>
                <TableCell num className="align-top">{hasPrev && r.previous != null ? euro(r.previous) : "—"}</TableCell>
                <TableCell num className="align-top">{v ? v.amount : "—"}</TableCell>
                <TableCell num className="align-top">{v ? v.percent : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!hasPrev ? <p className="mt-3 px-4 text-xs text-muted-foreground">{content.comparison.available ? null : content.comparison.reason}</p> : null}
    </div>
  );
}

/** Soldes repères mis en évidence (sans changer leur place dans le tableau). */
const KEY_SOLDES = new Set(["VALEUR_AJOUTEE", "EBE"]);

function Contributions({ row, entriesHref }: { row: SnapshotContent["rows"][number]; entriesHref?: (account: string) => string }) {
  return (
    <div className="mb-1 mt-3 overflow-x-auto rounded-lg border bg-card font-normal text-foreground shadow-card">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="bg-surface-2/60 text-muted-foreground">
          <tr className="text-left [&>th]:font-medium">
            <th className="p-2">Compte</th><th className="p-2">PCG</th><th className="p-2 text-right">Montant</th>
            <th className="p-2">Règle</th><th className="p-2">Origine</th>
          </tr>
        </thead>
        <tbody>
          {row.contributions.map((c) => (
            <tr key={c.account} className="border-t align-top" data-testid={`contrib-${c.account}`}>
              <td className="p-2"><span className="font-mono">{c.account}</span><br />{c.label}</td>
              <td className="p-2 font-mono">{c.pcgAccount}</td>
              <td className="num p-2 text-right">{euro(c.amount)}{c.debit != null ? <><br /><span className="text-muted-foreground">D {euro(c.debit)} / C {euro(c.credit ?? "0")}</span></> : null}</td>
              <td className="p-2"><BasisTag basis={c.basis} />{c.via}</td>
              <td className="p-2">
                {c.fileName ?? c.importId}
                {c.rows ? ` — ligne ${c.rows.join(", ")}` : null}
                {c.entries != null ? <> — {entriesHref ? <Link className="font-medium text-primary underline underline-offset-2 dark:text-info-text" href={entriesHref(c.account)}>{c.entries} écriture{c.entries > 1 ? "s" : ""}</Link> : `${c.entries} écritures`}</> : null}
                {c.minus ? <><br />moins {c.minus.fileName ?? c.minus.importId}{c.minus.rows ? ` — ligne ${c.minus.rows.join(", ")}` : null}</> : null}
              </td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="p-2" colSpan={2}>Total</td>
            <td className="num p-2 text-right">{euro(row.value)}</td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ChecksPanel({ checks }: { checks: SnapshotContent["checks"] }) {
  if (!checks.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-success-text" data-testid="sig-checks-ok">
        <CircleCheck className="size-4" aria-hidden /> Aucune anomalie : résultat rapproché au centime.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="sig-checks">
      {checks.map((c) => {
        const blocking = c.severity === "blocking";
        const Icon = blocking ? CircleAlert : TriangleAlert;
        return (
          <li
            key={c.code}
            data-check={c.code}
            className={cn(
              "rounded-lg border border-l-[3px] p-4 text-sm",
              blocking ? "border-destructive/30 border-l-destructive bg-destructive-surface" : "border-warning/30 border-l-warning bg-warning-surface",
            )}
          >
            <p className="flex flex-wrap items-start gap-2 font-medium">
              <Icon className={cn("mt-0.5 size-4 shrink-0", blocking ? "text-destructive-text" : "text-warning-text")} aria-hidden />
              <span>
                <span className={cn("mr-1 text-xs font-semibold uppercase tracking-wide", blocking ? "text-destructive-text" : "text-warning-text")}>
                  {blocking ? "Bloquant — " : "Avertissement — "}
                </span>
                {c.title}{c.amount ? <span className="num"> ({euro(c.amount)})</span> : ""}
              </span>
            </p>
            <p className="mt-1 pl-6 text-muted-foreground">{c.explanation}</p>
            {c.accounts.length ? (
              <ul className="mt-2 space-y-1 pl-6 text-xs">
                {c.accounts.map((a) => (
                  <li key={a.account}>
                    <span className="font-mono font-medium">{a.account}</span> {a.label}
                    {a.amount !== "0.00" ? <span className="num"> — {euro(a.amount)}</span> : ""}
                    {a.detail ? <span className="text-muted-foreground"> — {a.detail}</span> : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const BASIS_TAGS = {
  pcg: { label: "PCG", className: "border-border-strong text-muted-foreground" },
  cabinet: { label: "Cabinet", className: "border-info/40 text-info-text" },
  company: { label: "Entreprise", className: "border-warning/50 text-warning-text" },
} as const;

/** Fondement d'un classement : règle PCG, convention du cabinet ou exception de l'entreprise. */
export function BasisTag({ basis }: { basis?: "pcg" | "cabinet" | "company" }) {
  if (!basis) return null;
  const t = BASIS_TAGS[basis];
  return <span className={cn("mr-1.5 inline-block rounded border px-1 text-[10px] font-semibold uppercase tracking-wide", t.className)}>{t.label}</span>;
}

