import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { frDate } from "@/domain/sig/periods";
import { euro } from "@/features/sig/format";
import { orNotFound, requireStaff } from "@/lib/guards";
import { getAccountEntries } from "@/services/sig";

export const metadata: Metadata = { title: "Écritures du compte" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EntriesPage({ params, searchParams }: PageProps<"/daf/c/[companyId]/sig/entries">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const actor = await requireStaff();
  const [fy, account, start, end] = [one(sp.exercice), one(sp.compte), one(sp.du), one(sp.au)];
  const { fec, entries } = await orNotFound(getAccountEntries(actor, companyId, fy, account, start, end));
  return (
    <>
      <PageHeader
        title={`Écritures du compte ${account}`}
        description={`Du ${frDate(start)} au ${frDate(end)} — ${fec ? fec.fileName : "aucun FEC"}`}
        actions={<Link href={`/daf/c/${companyId}/sig?exercice=${fy}`} className={buttonVariants({ variant: "outline" })}>Retour aux SIG</Link>}
      />
      {entries.length === 500 ? <Alert variant="info" className="mb-4">Seules les 500 premières écritures sont affichées.</Alert> : null}
      <Table data-testid="account-entries">
        <TableHeader>
          <TableRow><TableHead>Date</TableHead><TableHead>Journal</TableHead><TableHead>N° écriture</TableHead><TableHead>Pièce</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead className="text-right">Ligne du fichier</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e, i) => (
            <TableRow key={i}>
              <TableCell>{frDate(e.date)}</TableCell><TableCell>{e.journal}</TableCell><TableCell className="font-mono">{e.entryNumber}</TableCell>
              <TableCell>{e.pieceRef}</TableCell><TableCell>{e.label}</TableCell>
              <TableCell className="text-right tabular-nums">{euro(e.debit)}</TableCell><TableCell className="text-right tabular-nums">{euro(e.credit)}</TableCell>
              <TableCell className="text-right tabular-nums">{e.sourceRow}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
