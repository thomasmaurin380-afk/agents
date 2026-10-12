/**
 * Mode d'interface : préférence d'affichage personnelle. Elle change la composition des pages
 * (disposition, densité, hiérarchie), jamais les données, les calculs ni les droits d'accès.
 *
 * Prototype : persistance locale au navigateur, isolée par utilisateur (clé contenant son
 * identifiant). Cible : préférence enregistrée côté serveur, par utilisateur. Aucune migration
 * n'est prévue à ce stade.
 */
export const INTERFACE_MODES = ["analyse", "pilotage"] as const;
export type InterfaceMode = (typeof INTERFACE_MODES)[number];

export const DEFAULT_INTERFACE_MODE: InterfaceMode = "analyse";

export const INTERFACE_MODE_LABELS: Record<InterfaceMode, { label: string; short: string; description: string }> = {
  analyse: {
    label: "Analyse financière",
    short: "Analyse",
    description: "Vue dense et analytique : bilan, ratios, comparaisons détaillées.",
  },
  pilotage: {
    label: "Pilotage financier",
    short: "Pilotage",
    description: "Vue éditoriale et synthétique : priorités, trésorerie, résultat.",
  },
};

export function isInterfaceMode(v: unknown): v is InterfaceMode {
  return typeof v === "string" && (INTERFACE_MODES as readonly string[]).includes(v);
}

/** Valeur lue en stockage : toute valeur inconnue ou absente retombe sur le mode par défaut. */
export function parseInterfaceMode(v: unknown): InterfaceMode {
  return isInterfaceMode(v) ? v : DEFAULT_INTERFACE_MODE;
}

const KEY_PREFIX = "daf:interface-mode:v1:";

/** Clé de stockage propre à un utilisateur : deux comptes d'un même navigateur ne partagent rien. */
export function interfaceModeStorageKey(userId: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(userId)) throw new RangeError("Identifiant utilisateur invalide");
  return KEY_PREFIX + userId;
}

/**
 * Garde de changement de mode : un écran comportant une saisie non enregistrée s'y inscrit.
 * Le changement n'est appliqué qu'après confirmation explicite ; rien n'est perdu en silence.
 */
export type ModeChangeGuard = () => string | null;

export function confirmModeChange(guards: Iterable<ModeChangeGuard>, confirm: (message: string) => boolean): boolean {
  for (const guard of guards) {
    const message = guard();
    if (message && !confirm(message)) return false;
  }
  return true;
}
