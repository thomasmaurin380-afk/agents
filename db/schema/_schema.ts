import { pgSchema } from "drizzle-orm/pg-core";

/** Schéma PostgreSQL des tables applicatives, non exposé par l'API Data de Supabase (D-13). */
export const app = pgSchema("app");
