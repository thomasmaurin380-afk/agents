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
    <div className="overflow-x-auto">
      <Table data-testid="sig-table">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-56">Rubrique</TableHead>
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
            const strong = r.kind === "solde";
            return (
              <TableRow key={r.code} data-row={r.code} className={cn(strong && "bg-muted/50 font-semibold")}>
                <TableCell style={{ paddingLeft: `${0.75 + r.level * 1.25}rem` }}>
                  {detail && r.kind === "line" && r.contributions.length > 0 ? (
                    <details>
                      <summary className="cursor-pointer">{r.label} <span className="text-xs font-normal text-muted-foreground">({r.contributions.length} compte{r.contributions.length > 1 ? "s" : ""})</span></summary>
                      <Contributions row={r} entriesHref={entriesHref} />
                    </details>
                  ) : (
                    <span title={r.definition ?? undefined}>{r.label}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap" data-testid={`sig-${r.code}`}>{euro(r.value)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{shareOfRevenue(r.value, ca) ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{hasPrev && r.previous != null ? euro(r.previous) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{v ? v.amount : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{v ? v.percent : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!hasPrev ? <p className="mt-2 text-xs text-muted-foreground">{content.comparison.available ? null : content.comparison.reason}</p> : null}
    </div>
  );
}

function Contributions({ row, entriesHref }: { row: SnapshotContent["rows"][number]; entriesHref?: (account: string) => string }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-md border bg-background font-normal">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="p-2">Compte</th><th className="p-2">PCG</th><th className="p-2 text-right">Montant</th>
            <th className="p-2">Règle</th><th className="p-2">Origine</th>
          </tr>
        </thead>
        <tbody>
          {row.contributions.map((c) => (
            <tr key={c.account} className="border-t align-top" data-testid={`contrib-${c.account}`}>
              <td className="p-2"><span className="font-mono">{c.account}</span><br />{c.label}</td>
              <td className="p-2 font-mono">{c.pcgAccount}</td>
              <td className="p-2 text-right tabular-nums whitespace-nowrap">{euro(c.amount)}{c.debit != null ? <><br /><span className="text-muted-foreground">D {euro(c.debit)} / C {euro(c.credit ?? "0")}</span></> : null}</td>
              <td className="p-2">{c.via}</td>
              <td className="p-2">
                {c.fileName ?? c.importId}
                {c.rows ? ` — ligne ${c.rows.join(", ")}` : null}
                {c.entries != null ? <> — {entriesHref ? <Link className="underline" href={entriesHref(c.account)}>{c.entries} écriture{c.entries > 1 ? "s" : ""}</Link> : `${c.entries} écritures`}</> : null}
                {c.minus ? <><br />moins {c.minus.fileName ?? c.minus.importId}{c.minus.rows ? ` — ligne ${c.minus.rows.join(", ")}` : null}</> : null}
              </td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="p-2" colSpan={2}>Total</td>
            <td className="p-2 text-right tabular-nums">{euro(row.value)}</td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ChecksPanel({ checks }: { checks: SnapshotContent["checks"] }) {
  if (!checks.length) return <p className="text-sm text-muted-foreground" data-testid="sig-checks-ok">Aucune anomalie : résultat rapproché au centime.</p>;
  return (
    <ul className="space-y-3" data-testid="sig-checks">
      {checks.map((c) => (
        <li key={c.code} data-check={c.code} className={cn("rounded-md border p-3 text-sm", c.severity === "blocking" ? "border-destructive/40 bg-destructive/5" : "border-warning/50 bg-warning/10")}>
          <p className="font-medium">{c.severity === "blocking" ? "Bloquant — " : "Avertissement — "}{c.title}{c.amount ? ` (${euro(c.amount)})` : ""}</p>
          <p className="text-muted-foreground">{c.explanation}</p>
          {c.accounts.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {c.accounts.map((a) => <li key={a.account}><span className="font-mono">{a.account}</span> {a.label}{a.amount !== "0.00" ? ` — ${euro(a.amount)}` : ""}{a.detail ? ` — ${a.detail}` : ""}</li>)}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
