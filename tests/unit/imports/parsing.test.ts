import { describe, expect, it } from "vitest";
import { detectDecimalSeparator, formatAmountFr, parseAmount, parseSpreadsheetNumber, sumAmounts } from "@/domain/imports/amounts";
import { detectDayMonthOrder, parseDate } from "@/domain/imports/dates";
import { detectDelimiter, parseDelimited } from "@/domain/imports/delimited";
import { detectHeaderRow } from "@/domain/imports/table";
import { decodeText, normalizeLabel } from "@/domain/imports/text";

describe("Montants", () => {
  it("lit les formats français et internationaux", () => {
    expect(parseAmount("1 234,56", ",")).toEqual({ ok: true, empty: false, value: "1234.56" });
    expect(parseAmount("1 234,5", ",")).toMatchObject({ value: "1234.50" });
    expect(parseAmount("1.234,56", ",")).toMatchObject({ value: "1234.56" });
    expect(parseAmount("1,234.56", ".")).toMatchObject({ value: "1234.56" });
    expect(parseAmount("-12,50", ",")).toMatchObject({ value: "-12.50" });
    expect(parseAmount("12,50-", ",")).toMatchObject({ value: "-12.50" });
    expect(parseAmount("(12,50)", ",")).toMatchObject({ value: "-12.50" });
    expect(parseAmount("12,50 €", ",")).toMatchObject({ value: "12.50" });
    expect(parseAmount("1500", null)).toMatchObject({ value: "1500.00" });
    expect(parseAmount("-0,00", ",")).toMatchObject({ value: "0.00" });
  });

  it("vide = absence de montant, jamais zéro inventé", () => {
    expect(parseAmount("", ",")).toEqual({ ok: true, value: null, empty: true });
    expect(parseAmount("  ", ",")).toEqual({ ok: true, value: null, empty: true });
  });

  it("rejette l'ambigu, l'illisible et plus de deux décimales", () => {
    expect(parseAmount("12,345", ",").ok).toBe(false);
    expect(parseAmount("1,5", null).ok).toBe(false);
    expect(parseAmount("abc", ",").ok).toBe(false);
    expect(parseAmount("12.34.56", ",").ok).toBe(false);
    expect(parseAmount("1.23,4.5", ",").ok).toBe(false);
  });

  it("déduit le séparateur décimal d'une colonne", () => {
    expect(detectDecimalSeparator(["1 000", "12,5", "3"])).toBe(",");
    expect(detectDecimalSeparator(["1,000.25", "4.10"])).toBe(".");
    expect(detectDecimalSeparator(["1000", "250"])).toBeNull();
  });

  it("nombres Excel : artefacts flottants arrondis, vraies 3e décimales rejetées", () => {
    expect(parseSpreadsheetNumber("1234.5600000000001")).toMatchObject({ value: "1234.56" });
    expect(parseSpreadsheetNumber("0.29999999999999999")).toMatchObject({ value: "0.30" });
    expect(parseSpreadsheetNumber("-15.5")).toMatchObject({ value: "-15.50" });
    expect(parseSpreadsheetNumber("1.5E3")).toMatchObject({ value: "1500.00" });
    expect(parseSpreadsheetNumber("12.345").ok).toBe(false);
  });

  it("affiche à la française", () => {
    expect(formatAmountFr("-1234567.80")).toBe("-1\u202f234\u202f567,80\u00a0€");
  });

  it("somme exacte en centimes", () => {
    expect(sumAmounts(["0.10", "0.20", null, "-0.05"])).toBe("0.25");
    expect(sumAmounts(Array.from({ length: 100_000 }, () => "0.01"))).toBe("1000.00");
  });
});

describe("Dates", () => {
  it("formats FEC, français, ISO", () => {
    expect(parseDate("20250131")).toEqual({ ok: true, value: "2025-01-31" });
    expect(parseDate("31/01/2025")).toEqual({ ok: true, value: "2025-01-31" });
    expect(parseDate("31-01-25")).toEqual({ ok: true, value: "2025-01-31" });
    expect(parseDate("2025-01-31")).toEqual({ ok: true, value: "2025-01-31" });
    expect(parseDate(new Date(Date.UTC(2025, 0, 31)))).toEqual({ ok: true, value: "2025-01-31" });
  });
  it("rejette les dates impossibles", () => {
    expect(parseDate("20250230").ok).toBe(false);
    expect(parseDate("31/02/2025").ok).toBe(false);
    expect(parseDate("demain").ok).toBe(false);
  });
  it("ordre jour/mois : français par défaut, américain seulement si prouvé", () => {
    expect(detectDayMonthOrder(["01/02/2025", "03/04/2025"])).toBe("dmy");
    expect(detectDayMonthOrder(["01/13/2025", "02/02/2025"])).toBe("mdy");
    expect(parseDate("02/01/2025", "mdy")).toEqual({ ok: true, value: "2025-02-01" });
  });
});

describe("Fichiers texte", () => {
  it("décode UTF-8 (avec BOM) et Windows-1252", () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Libellé;Crédit")]);
    expect(decodeText(utf8)).toEqual({ text: "Libellé;Crédit", encoding: "utf-8" });
    const latin1 = new Uint8Array([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9]); // « Libellé » en ISO-8859-1
    expect(decodeText(latin1)).toEqual({ text: "Libellé", encoding: "windows-1252" });
  });

  it("détecte le séparateur et gère les guillemets", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a|b|c\n1|2|3")).toBe("|");
    expect(detectDelimiter('a,b,c\n"1,5",2,3')).toBe(",");
    expect(parseDelimited('Compte;Libellé\r\n401;"Fournisseur ; ""Dupont"""\r\n', ";")).toEqual([
      ["Compte", "Libellé"],
      ["401", 'Fournisseur ; "Dupont"'],
    ]);
  });

  it("repère l'en-tête sous des lignes de titre", () => {
    const rows = [["Balance générale au 31/12/2025"], [], ["Compte", "Intitulé", "Solde débit", "Solde crédit"], ["401", "Fournisseurs", "", "1 200,00"]];
    expect(detectHeaderRow(rows)).toBe(2);
  });

  it("normalise les libellés", () => {
    expect(normalizeLabel("  Solde Débiteur (€) ")).toBe("solde debiteur");
  });
});
