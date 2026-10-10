import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { StorageProvider } from "./index";

const BUCKET = "company-files";

/** Supabase Storage, bucket privé ; accès serveur uniquement (clé service). */
export function createSupabaseStorage(): StorageProvider {
  const env = serverEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let bucketReady: Promise<void> | null = null;
  const ensureBucket = () =>
    (bucketReady ??= (async () => {
      const { data } = await client.storage.getBucket(BUCKET);
      if (data) return;
      const { error } = await client.storage.createBucket(BUCKET, { public: false });
      if (error && !/already exists/i.test(error.message)) {
        bucketReady = null;
        throw new Error(`Stockage indisponible : ${error.message}`);
      }
    })());

  return {
    async put(key, bytes, contentType) {
      await ensureBucket();
      const { error } = await client.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: false });
      // La clé contient l'empreinte du contenu : un objet déjà présent est identique.
      if (error && !/already exists|Duplicate/i.test(error.message)) {
        throw new Error(`Échec de l'enregistrement du fichier : ${error.message}`);
      }
    },
    async get(key) {
      await ensureBucket();
      const { data, error } = await client.storage.from(BUCKET).download(key);
      if (error || !data) throw new Error(`Fichier introuvable dans le stockage : ${key}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    async delete(key) {
      await ensureBucket();
      // `remove` ne signale pas d'erreur pour un objet déjà absent.
      const { error } = await client.storage.from(BUCKET).remove([key]);
      if (error) throw new Error(`Échec de la suppression du fichier : ${error.message}`);
    },
  };
}
