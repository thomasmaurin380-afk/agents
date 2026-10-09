import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REQUIRE_STAFF_MFA: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Variables d'environnement serveur, validées au premier accès. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuration invalide ou incomplète : ${keys}`);
  }
  if (parsed.data.APP_ENV === "production" && !parsed.data.REQUIRE_STAFF_MFA) {
    throw new Error("REQUIRE_STAFF_MFA ne peut pas être désactivé en production.");
  }
  cached = parsed.data;
  return cached;
}
