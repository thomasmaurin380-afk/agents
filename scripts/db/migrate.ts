// Applique les migrations SQL versionnées (db/migrations) sur DATABASE_URL.
// Fonctionne sur tout PostgreSQL >= 16 (Supabase ou non) : voir D-01.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  console.log("Migrations appliquées.");
} finally {
  await client.end();
}
