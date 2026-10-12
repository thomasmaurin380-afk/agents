"use client";

import { useCallback, useEffect, useState } from "react";
import type * as React from "react";
import { DEFAULT_INTERFACE_MODE, isInterfaceMode, type InterfaceMode } from "../../lib/interface-mode";
// Sélecteur et contexte d'origine (import relatif : ce module remplace uniquement le fournisseur).
import { InterfaceModeContext, InterfaceModeSwitch, useInterfaceMode } from "../../components/layout/interface-mode";

export { InterfaceModeSwitch, useInterfaceMode };

/** Clé de la préférence dans localStorage (démonstration sans compte utilisateur). */
export const DEMO_MODE_KEY = "plateforme-daf-demo:interface-mode";

export function readStoredMode(): InterfaceMode {
  try {
    const v = window.localStorage.getItem(DEMO_MODE_KEY);
    return isInterfaceMode(v) ? v : DEFAULT_INTERFACE_MODE;
  } catch {
    return DEFAULT_INTERFACE_MODE;
  }
}

/**
 * Fournisseur du mode d'interface pour la démonstration statique : même contexte et même attribut
 * `data-ui-mode` que l'application, mais la préférence est conservée dans localStorage au lieu
 * du cookie par utilisateur (aucune authentification, aucun serveur).
 */
export function InterfaceModeProvider({ initialMode, className, children }: {
  userId?: string;
  initialMode?: InterfaceMode;
  className?: string;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<InterfaceMode>(() => initialMode ?? readStoredMode());
  const setMode = useCallback((m: InterfaceMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(DEMO_MODE_KEY, m);
    } catch {
      /* stockage indisponible (navigation privée) : le changement reste valable pour la session */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.uiMode = mode;
  }, [mode]);
  return (
    <InterfaceModeContext.Provider value={{ mode, setMode, pending: false }}>
      <div data-ui-mode={mode} className={className}>{children}</div>
    </InterfaceModeContext.Provider>
  );
}
