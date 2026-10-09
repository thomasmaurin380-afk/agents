import { describe, expect, it } from "vitest";
import { Money } from "@/domain/money/money";

describe("Money", () => {
  it("additionne sans erreur de flottant (0,1 + 0,2 = 0,30)", () => {
    expect(Money.fromDb("0.10").add(Money.fromDb("0.20")).toDb()).toBe("0.30");
  });

  it("somme exacte de 1 000 000 de centimes", () => {
    const values = Array.from({ length: 1000 }, () => Money.fromDb("1000.01"));
    expect(Money.sum(values).toDb()).toBe("1000010.00");
  });

  it("arrondit au centime, demi à l'écart de zéro", () => {
    expect(Money.fromDb("10.00").mul("0.0005").roundToCents().toDb()).toBe("0.01");
    expect(Money.fromDb("-10.00").mul("0.0005").roundToCents().toDb()).toBe("-0.01");
    expect(Money.fromDb("100.00").mul("0.2").roundToCents().toDb()).toBe("20.00");
  });

  it("refuse d'écrire en base un montant non arrondi", () => {
    expect(() => Money.fromDb("10.00").mul("0.3333").toDb()).toThrow(/non arrondi/);
  });

  it("rejette les représentations invalides", () => {
    for (const bad of ["1,5", "1e3", "abc", "", "1.234", "NaN"]) {
      expect(() => Money.fromDb(bad)).toThrow();
    }
  });

  it("convertit depuis des centimes entiers", () => {
    expect(Money.fromCents(123456).toDb()).toBe("1234.56");
    expect(Money.fromCents(-5n).toDb()).toBe("-0.05");
    expect(() => Money.fromCents(1.5)).toThrow();
  });

  it("formate à la française", () => {
    expect(Money.fromDb("1234567.89").format()).toBe("1 234 567,89 €");
    expect(Money.fromDb("-0.50").format()).toBe("-0,50 €");
    expect(Money.zero().format()).toBe("0,00 €");
  });

  it("compare et teste le signe", () => {
    expect(Money.fromDb("1.00").compare(Money.fromDb("2.00"))).toBe(-1);
    expect(Money.fromDb("-0.00").isNegative()).toBe(false);
    expect(Money.fromDb("-0.01").isNegative()).toBe(true);
    expect(Money.fromDb("5.00").equals(Money.fromDb("5"))).toBe(true);
  });
});
