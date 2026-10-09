import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { integrationUrls } from "./db-url";

/** Base d'intégration recréée à chaque exécution puis migrée (prouve aussi que les migrations s'appliquent à vide). */
export default async function setup() {
  const urls = integrationUrls();
  const admin = postgres(urls.admin, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe("drop database if exists daf_it with (force)");
    await admin.unsafe("create database daf_it");
  } finally {
    await admin.end();
  }
  const client = postgres(urls.it, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
    // Rejouer les migrations doit être sans effet (idempotence du suivi).
    await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  } finally {
    await client.end();
  }
}
