// Les fichiers de démonstration (demo-files/) passent le moteur d'import sans erreur et sont
// cohérents entre eux : la balance égale les cumuls du FEC, le relevé égale le compte 512.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sumAmounts, toCents } from "@/domain/imports/amounts";
import { analyzeBank } from "@/domain/imports/bank";
import { analyzeFec } from "@/domain/imports/fec";
import { BANK_FIELDS, suggestColumns, TRIAL_BALANCE_FIELDS } from "@/domain/imports/fields";
import { hasBlockingErrors } from "@/domain/imports/issues";
import { detectHeaderRow, headersAt } from "@/domain/imports/table";
import { analyzeTrialBalance } from "@/domain/imports/trial-balance";
import { readTable } from "@/lib/imports/read-table";

const load = (name: string) => new Uint8Array(readFileSync(`demo-files/${name}`));
const fy = { startDate: "2025-01-01", endDate: "2025-12-31" };

describe("Fichiers de démonstration", async () => {
  const fecTable = await readTable(load("atelier-numerique-FEC-2025.txt"), "fec");
  const fec = analyzeFec(fecTable, { fiscalYear: fy, fileName: "atelier-numerique-FEC-2025.txt", companySiren: null });

  it("FEC : aucune erreur bloquante, équilibré", () => {
    expect(hasBlockingErrors(fec.issues)).toBe(false);
    expect(fec.totals.debit).toBe(fec.totals.credit);
    expect(fecTable.delimiter).toBe("\t");
  });

  it("balance (Windows-1252, titres) : équilibrée et égale aux cumuls du FEC par compte", async () => {
    const t = await readTable(load("atelier-numerique-balance-2025-12-31.csv"), "trial_balance");
    expect(t.encoding).toBe("windows-1252");
    const headerRow = detectHeaderRow(t.rows);
    const columns = suggestColumns(TRIAL_BALANCE_FIELDS, headersAt(t.rows, headerRow));
    const tb = analyzeTrialBalance(t, { headerRow, amountMode: "debit_credit", columns });
    expect(hasBlockingErrors(tb.issues)).toBe(false);
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    for (const line of tb.lines) {
      const fl = fec.lines.filter((l) => l.accountNumber === line.accountNumber);
      const net = toCents(sumAmounts(fl.map((l) => l.debit))) - toCents(sumAmounts(fl.map((l) => l.credit)));
      expect(toCents(line.closingDebit) - toCents(line.closingCredit), line.accountNumber).toBe(net);
    }
    expect(tb.lines[0].accountLabel).toBe("Capital social");
  });

  it("relevé CSV : solde courant cohérent, flux = mouvements du compte 512 hors à-nouveau", async () => {
    const t = await readTable(load("atelier-numerique-releve-2025.csv"), "bank_transactions");
    const columns = suggestColumns(BANK_FIELDS, headersAt(t.rows, 0));
    const bank = analyzeBank(t, { headerRow: 0, amountMode: "debit_credit", columns });
    expect(hasBlockingErrors(bank.issues)).toBe(false);
    expect(bank.runningBalance.status).toBe("consistent");
    const f512 = fec.lines.filter((l) => l.accountNumber === "512000" && l.journalCode !== "AN");
    const net = toCents(sumAmounts(f512.map((l) => l.debit))) - toCents(sumAmounts(f512.map((l) => l.credit)));
    expect(toCents(bank.totals.net)).toBe(net);
  });

  it("relevé XLSX : dates natives et montants exacts", async () => {
    const t = await readTable(load("atelier-numerique-releve-S1-2025.xlsx"), "bank_transactions");
    expect(t.format).toBe("xlsx");
    const columns = suggestColumns(BANK_FIELDS, headersAt(t.rows, 0));
    expect(columns).toMatchObject({ date: 0, label: 1, amount: 2 });
    const bank = analyzeBank(t, { headerRow: 0, amountMode: "signed", columns });
    expect(hasBlockingErrors(bank.issues)).toBe(false);
    expect(bank.totals.first).toBe("2025-01-03");
    expect(bank.totals.last! <= "2025-06-30").toBe(true);
    expect(bank.lines[0]).toMatchObject({ bookingDate: "2025-01-03", amount: "-1320.00", label: "PRLV LOYER BUREAUX" });
  });
});

describe("Lecture de fichiers : refus explicites", () => {
  it("fichier vide, .xls ancien, binaire", async () => {
    await expect(readTable(new Uint8Array(), "bank_transactions")).rejects.toThrow(/vide/);
    await expect(readTable(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2]), "trial_balance")).rejects.toThrow(/97-2003/);
    await expect(readTable(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "fec")).rejects.toThrow(/fichier texte/);
    await expect(readTable(Uint8Array.from([0x41, 0x00, 0x42]), "trial_balance")).rejects.toThrow(/binaire/);
  });
});
