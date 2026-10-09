import "server-only";
import { sql } from "drizzle-orm";
import { getOwnerDb, type OwnerDb } from "./client";

export type Tx = Parameters<Parameters<OwnerDb["transaction"]>[0]>[0];

declare const runtimeTxBrand: unique symbol;
/** Transaction soumise à la RLS, au nom d'un utilisateur. Seul type accepté par les repositories. */
export type RuntimeTx = Tx & { readonly [runtimeTxBrand]: true };

/**
 * Exécute `fn` dans une transaction au nom de `userId` (ou anonyme si null) :
 * `SET LOCAL ROLE app_runtime` + `app.user_id`, tous deux limités à la transaction.
 */
export async function withUser<T>(
  userId: string | null,
  fn: (tx: RuntimeTx) => Promise<T>,
): Promise<T> {
  return getOwnerDb().transaction(async (tx) => {
    await tx.execute(sql`set local role app_runtime`);
    await tx.execute(sql`select set_config('app.user_id', ${userId ?? ""}, true)`);
    return fn(tx as RuntimeTx);
  });
}
