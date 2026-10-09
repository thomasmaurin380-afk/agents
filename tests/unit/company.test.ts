import { describe, expect, it } from "vitest";
import { fiscalYearLabel } from "@/domain/company/fiscal-year";
import { isValidSiren, normalizeSiren } from "@/domain/company/siren";

describe("SIREN", () => {
  it("accepte un SIREN à clé de Luhn valide", () => {
    expect(isValidSiren("732829320")).toBe(true);
    expect(isValidSiren("732 829 320")).toBe(true);
  });
  it("refuse une clé invalide ou un format incorrect", () => {
    expect(isValidSiren("732829321")).toBe(false);
    expect(isValidSiren("12345678")).toBe(false);
    expect(isValidSiren("ABCDEFGHI")).toBe(false);
  });
  it("normalise espaces et points", () => {
    expect(normalizeSiren("732.829 320")).toBe("732829320");
  });
});

describe("Exercice", () => {
  it("décrit l'année civile et les exercices décalés", () => {
    expect(fiscalYearLabel(1)).toMatch(/Année civile/);
    expect(fiscalYearLabel(7)).toBe("Exercice décalé (1er juillet → 30 juin)");
    expect(fiscalYearLabel(3)).toBe("Exercice décalé (1er mars → 28 février)");
    expect(fiscalYearLabel(10)).toBe("Exercice décalé (1er octobre → 30 septembre)");
  });
  it("rejette un mois invalide", () => {
    expect(() => fiscalYearLabel(0)).toThrow();
    expect(() => fiscalYearLabel(13)).toThrow();
  });
});
