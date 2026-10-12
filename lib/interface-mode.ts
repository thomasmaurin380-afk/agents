/**
 * Mode d'interface : préférence d'affichage personnelle (aucun effet sur les données, les
 * calculs ni les droits). Deux compositions complètes de la même plateforme :
 *  - « analyse »  : densité analytique, structure financière, tableaux comparatifs ;
 *  - « pilotage » : cartes de décision, trésorerie et résultat mis en avant.
 *
 * Prototype : mémorisée dans un cookie qui associe le mode à l'identifiant de l'utilisateur
 * (plusieurs comptes sur un même navigateur ne s'influencent pas). Cible : préférence
 * enregistrée côté serveur par utilisateur (sans migration à ce stade).
 */
export const INTERFACE_MODES = ["analyse", "pilotage"] as const;
export type InterfaceMode = (typeof INTERFACE_MODES)[number];
export const DEFAULT_INTERFACE_MODE: InterfaceMode = "analyse";
export const INTERFACE_MODE_COOKIE = "daf_ui_mode";

export const INTERFACE_MODE_LABELS: Record<InterfaceMode, { label: string; description: string }> = {
  analyse: { label: "Analyse financière", description: "Structure financière, comparaisons et tableaux détaillés." },
  pilotage: { label: "Pilotage financier", description: "Trésorerie, résultat et opérations récentes en priorité." },
};

export function isInterfaceMode(v: unknown): v is InterfaceMode {
  return typeof v === "string" && (INTERFACE_MODES as readonly string[]).includes(v);
}

const MAX_ENTRIES = 5;
const UUID = /^[0-9a-f-]{36}$/i;

/** Lit la valeur du cookie (« uid:mode|uid:mode ») pour un utilisateur donné. */
export function readInterfaceMode(cookieValue: string | undefined | null, userId: string): InterfaceMode {
  if (!cookieValue) return DEFAULT_INTERFACE_MODE;
  for (const entry of decodeURIComponent(cookieValue).split("|")) {
    const [uid, mode] = entry.split(":");
    if (uid === userId && isInterfaceMode(mode)) return mode;
  }
  return DEFAULT_INTERFACE_MODE;
}

/** Nouvelle valeur du cookie : l'entrée de l'utilisateur en tête, les autres conservées (5 au plus). */
export function writeInterfaceMode(cookieValue: string | undefined | null, userId: string, mode: InterfaceMode): string {
  const others = (cookieValue ? decodeURIComponent(cookieValue).split("|") : [])
    .map((e) => e.split(":"))
    .filter(([uid, m]) => uid && UUID.test(uid) && uid !== userId && isInterfaceMode(m))
    .map(([uid, m]) => `${uid}:${m}`);
  return [`${userId}:${mode}`, ...others].slice(0, MAX_ENTRIES).join("|");
}
