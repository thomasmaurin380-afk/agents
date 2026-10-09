import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

/**
 * Client Supabase lié aux cookies de la requête (Server Components, Server Actions).
 * Seul `lib/auth/` importe `@supabase/*` (portabilité, D-01).
 */
export async function createSupabaseServerClient() {
  // Lire les cookies en premier : la page devient dynamique (jamais pré-rendue au build).
  const cookieStore = await cookies();
  const env = serverEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Appel depuis un Server Component : les cookies sont rafraîchis par proxy.ts.
        }
      },
    },
  });
}

/** Client d'administration (clé service). Serveur uniquement, jamais exposé au navigateur. */
export function createSupabaseAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
