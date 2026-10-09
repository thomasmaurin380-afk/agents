import "server-only";
import { createSupabaseStorage } from "./supabase";

/**
 * Stockage des fichiers originaux (imports, documents, PDF). Interface volontairement minimale
 * pour pouvoir changer de fournisseur (tout stockage compatible S3) — D-01.
 */
export interface StorageProvider {
  /** Écrit un objet ; idempotent pour une même clé et un même contenu. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

let override: StorageProvider | null = null;
let instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (override) return override;
  instance ??= createSupabaseStorage();
  return instance;
}

/** Tests uniquement : remplace le fournisseur (ex. stockage en mémoire). */
export function setStorageForTests(provider: StorageProvider | null): void {
  override = provider;
}

export class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.objects.set(key, bytes);
  }
  async get(key: string) {
    const v = this.objects.get(key);
    if (!v) throw new Error(`Objet introuvable : ${key}`);
    return v;
  }
}
