import "server-only";
import { cookies } from "next/headers";
import { INTERFACE_MODE_COOKIE, readInterfaceMode, type InterfaceMode } from "./interface-mode";

/** Mode d'interface de l'utilisateur connecté (lu côté serveur : pas de changement visuel au chargement). */
export async function getInterfaceMode(userId: string): Promise<InterfaceMode> {
  const store = await cookies();
  return readInterfaceMode(store.get(INTERFACE_MODE_COOKIE)?.value, userId);
}
