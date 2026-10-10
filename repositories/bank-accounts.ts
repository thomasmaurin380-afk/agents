import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { bankAccounts, bankTransactions } from "@/db/schema";
import type { RuntimeTx } from "@/lib/db/tenant";

export async function listBankAccounts(tx: RuntimeTx, companyId: string) {
  return tx
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      label: bankAccounts.label,
      ibanLast4: bankAccounts.ibanLast4,
      currency: bankAccounts.currency,
      // Colonne qualifiée explicitement : dans une sous-requête corrélée, Drizzle rend « "id" » sans table.
      transactionCount: sql<number>`(select count(*)::int from app.bank_transactions t where t.bank_account_id = "bank_accounts"."id")`,
      lastDate: sql<string | null>`(select max(t.booking_date)::text from app.bank_transactions t where t.bank_account_id = "bank_accounts"."id")`,
    })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), isNull(bankAccounts.archivedAt)))
    .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.label));
}

export async function findBankAccount(tx: RuntimeTx, companyId: string, id: string) {
  const [row] = await tx.select().from(bankAccounts).where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.id, id)));
  return row ?? null;
}

export async function insertBankAccount(
  tx: RuntimeTx,
  data: { companyId: string; bankName: string; label: string; ibanLast4: string | null; createdBy: string },
) {
  const id = randomUUID();
  await tx.insert(bankAccounts).values({ ...data, id });
  return { id };
}

/** Empreintes déjà enregistrées pour ce compte parmi celles fournies (détection des doublons). */
export async function existingTransactionHashes(tx: RuntimeTx, companyId: string, bankAccountId: string, hashes: string[]) {
  const found = new Set<string>();
  for (let i = 0; i < hashes.length; i += 5000) {
    const rows = await tx
      .select({ h: bankTransactions.naturalKeyHash })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.companyId, companyId),
          eq(bankTransactions.bankAccountId, bankAccountId),
          inArray(bankTransactions.naturalKeyHash, hashes.slice(i, i + 5000)),
        ),
      );
    for (const r of rows) found.add(r.h);
  }
  return found;
}

export async function insertBankTransactions(tx: RuntimeTx, rows: (typeof bankTransactions.$inferInsert)[]) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const res = await tx
      .insert(bankTransactions)
      .values(rows.slice(i, i + 1000))
      .onConflictDoNothing({ target: [bankTransactions.companyId, bankTransactions.bankAccountId, bankTransactions.naturalKeyHash] })
      .returning({ id: bankTransactions.id });
    inserted += res.length;
  }
  return inserted;
}

/** Empreintes des opérations déjà enregistrées pour ce compte entre deux dates (incluses). */
export async function transactionHashesInRange(tx: RuntimeTx, companyId: string, bankAccountId: string, from: string, to: string) {
  const rows = await tx
    .select({ h: bankTransactions.naturalKeyHash })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, companyId),
        eq(bankTransactions.bankAccountId, bankAccountId),
        gte(bankTransactions.bookingDate, from),
        lte(bankTransactions.bookingDate, to),
      ),
    );
  return rows.map((r) => r.h);
}
