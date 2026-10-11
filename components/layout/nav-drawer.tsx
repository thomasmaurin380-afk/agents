"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Tiroir de navigation mobile (case à cocher #nav-toggle) : fermeture par Échap, retour du
 * focus sur le bouton « Menu », fermeture automatique après navigation.
 */
export function NavDrawerController() {
  const pathname = usePathname();
  useEffect(() => {
    const box = document.getElementById("nav-toggle") as HTMLInputElement | null;
    if (box) box.checked = false;
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const box = document.getElementById("nav-toggle") as HTMLInputElement | null;
      if (e.key === "Escape" && box?.checked) {
        box.checked = false;
        box.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
