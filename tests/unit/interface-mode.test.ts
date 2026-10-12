import { describe, expect, it } from "vitest";
import {
  confirmModeChange, DEFAULT_INTERFACE_MODE, interfaceModeStorageKey, isInterfaceMode, parseInterfaceMode,
} from "@/features/interface-mode/mode";

describe("mode d'interface", () => {
  it("n'accepte que les deux modes ; toute autre valeur retombe sur le mode par défaut", () => {
    expect(DEFAULT_INTERFACE_MODE).toBe("analyse");
    expect(isInterfaceMode("pilotage")).toBe(true);
    for (const v of [null, undefined, "", "Pilotage", "admin", 1, {}]) expect(parseInterfaceMode(v)).toBe("analyse");
    expect(parseInterfaceMode("pilotage")).toBe("pilotage");
  });

  it("clé de stockage propre à chaque utilisateur (aucun partage sur un même navigateur)", () => {
    const a = interfaceModeStorageKey("0b6f1c3e-1111-4a2b-9c3d-000000000001");
    const b = interfaceModeStorageKey("0b6f1c3e-1111-4a2b-9c3d-000000000002");
    expect(a).not.toBe(b);
    expect(a.endsWith("000000000001")).toBe(true);
  });

  it("refuse un identifiant qui pourrait produire une clé ambiguë ou partagée", () => {
    for (const id of ["", "a:b", "../x", "x".repeat(65), "id with space"]) {
      expect(() => interfaceModeStorageKey(id)).toThrow(RangeError);
    }
  });

  it("une saisie non enregistrée bloque la bascule sauf confirmation explicite", () => {
    const dirty = () => "Modifications non enregistrées";
    const clean = () => null;
    const asked: string[] = [];
    expect(confirmModeChange([clean], () => false)).toBe(true);
    expect(confirmModeChange([clean, dirty], (m) => (asked.push(m), false))).toBe(false);
    expect(asked).toEqual(["Modifications non enregistrées"]);
    expect(confirmModeChange([dirty], () => true)).toBe(true);
  });
});
