import { describe, expect, it } from "vitest";
import { DEFAULT_INTERFACE_MODE, readInterfaceMode, writeInterfaceMode } from "@/lib/interface-mode";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("Mode d'interface : préférence isolée par utilisateur", () => {
  it("défaut sans cookie ou valeur invalide", () => {
    expect(readInterfaceMode(undefined, A)).toBe(DEFAULT_INTERFACE_MODE);
    expect(readInterfaceMode(`${A}:luxe`, A)).toBe(DEFAULT_INTERFACE_MODE);
    expect(readInterfaceMode("n'importe quoi", A)).toBe(DEFAULT_INTERFACE_MODE);
  });

  it("le choix d'un utilisateur ne s'applique jamais à un autre", () => {
    const v = writeInterfaceMode(undefined, A, "pilotage");
    expect(readInterfaceMode(v, A)).toBe("pilotage");
    expect(readInterfaceMode(v, B)).toBe(DEFAULT_INTERFACE_MODE);
    const v2 = writeInterfaceMode(v, B, "analyse");
    expect(readInterfaceMode(v2, A)).toBe("pilotage");
    expect(readInterfaceMode(v2, B)).toBe("analyse");
  });

  it("une entrée par utilisateur, cinq au plus, entrées étrangères ignorées", () => {
    let v = writeInterfaceMode(`evil:pilotage|${A}:analyse`, A, "pilotage");
    expect(v).toBe(`${A}:pilotage`);
    for (let i = 0; i < 7; i++) v = writeInterfaceMode(v, `0000000${i}-0000-4000-8000-000000000000`, "analyse");
    expect(v.split("|")).toHaveLength(5);
  });
});
