import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "@/db/schema";

function createOwnerDb() {
  /**
   * `prepare: false` : compatible avec le pooler Supabase en mode transaction.
   */
  const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 10 });
  return drizzle(client, { schema, casing: "snake_case" });
}

export type OwnerDb = ReturnType<typeof createOwnerDb>;

declare global {
  var __dafOwnerDb: OwnerDb | undefined;
}

/**
 * Connexion propriétaire, créée au premier usage (le build ne requiert aucun secret).
 * Ne JAMAIS l'utiliser directement pour une requête métier : passer par `withUser()`
 * (lib/db/tenant.ts), qui applique le rôle `app_runtime` et donc la RLS.
 */
export function getOwnerDb(): OwnerDb {
  globalThis.__dafOwnerDb ??= createOwnerDb();
  return globalThis.__dafOwnerDb;
}
