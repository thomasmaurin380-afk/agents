"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type * as React from "react";
import {
  confirmModeChange, DEFAULT_INTERFACE_MODE, interfaceModeStorageKey, parseInterfaceMode,
  type InterfaceMode, type ModeChangeGuard,
} from "./mode";

type Ctx = {
  /** `null` tant que la préférence locale n'est pas lue (premier rendu serveur). */
  mode: InterfaceMode | null;
  /** Le sélecteur est-il proposé ? (aperçu de conception uniquement, à ce stade) */
  enabled: boolean;
  setMode: (next: InterfaceMode) => boolean;
  registerGuard: (guard: ModeChangeGuard) => () => void;
};

const InterfaceModeContext = createContext<Ctx>({
  mode: DEFAULT_INTERFACE_MODE,
  enabled: false,
  setMode: () => false,
  registerGuard: () => () => {},
});

const EVENT = "daf:interface-mode";

function read(key: string): InterfaceMode {
  try {
    return parseInterfaceMode(window.localStorage.getItem(key));
  } catch {
    return DEFAULT_INTERFACE_MODE; // stockage indisponible (navigation privée stricte…)
  }
}

/**
 * Fournit le mode d'interface de l'utilisateur connecté. La préférence est lue et écrite sous
 * une clé propre à cet utilisateur, et synchronisée entre ses onglets. L'attribut
 * `data-interface-mode` de <html> porte les jetons propres au mode (densité de la coque).
 */
export function InterfaceModeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const key = interfaceModeStorageKey(userId);
  const guards = useRef(new Set<ModeChangeGuard>());

  const subscribe = useCallback(
    (notify: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) notify();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(EVENT, notify);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(EVENT, notify);
      };
    },
    [key],
  );
  const mode = useSyncExternalStore(subscribe, () => read(key), () => null);

  useEffect(() => {
    if (!mode) return;
    document.documentElement.dataset.interfaceMode = mode;
    return () => {
      delete document.documentElement.dataset.interfaceMode;
    };
  }, [mode]);

  const setMode = useCallback(
    (next: InterfaceMode) => {
      if (next === read(key)) return true;
      if (!confirmModeChange(guards.current, (m) => window.confirm(m))) return false;
      try {
        window.localStorage.setItem(key, next);
      } catch {
        return false;
      }
      window.dispatchEvent(new Event(EVENT));
      return true;
    },
    [key],
  );

  const registerGuard = useCallback((guard: ModeChangeGuard) => {
    guards.current.add(guard);
    return () => void guards.current.delete(guard);
  }, []);

  const value = useMemo(() => ({ mode, enabled: true, setMode, registerGuard }), [mode, setMode, registerGuard]);
  return <InterfaceModeContext.Provider value={value}>{children}</InterfaceModeContext.Provider>;
}

export function useInterfaceMode(): Ctx {
  return useContext(InterfaceModeContext);
}

/**
 * À utiliser par tout formulaire : tant que `dirty` est vrai, un changement de mode demande
 * confirmation au lieu d'effacer la saisie en silence.
 */
export function useModeChangeGuard(dirty: boolean, message = "Des modifications ne sont pas enregistrées. Changer de mode d'interface quand même ?") {
  const { registerGuard } = useInterfaceMode();
  const state = useRef({ dirty, message });
  useEffect(() => {
    state.current = { dirty, message };
  });
  useEffect(() => registerGuard(() => (state.current.dirty ? state.current.message : null)), [registerGuard]);
}
