import { describe, expect, it } from "vitest";
import { classifyAccount, normalizeAccountNumber, pcgRoot } from "@/domain/imports/accounts";
import { analyzeBank, type BankMapping } from "@/domain/imports/bank";
import { analyzeFec } from "@/domain/imports/fec";
import { BANK_FIELDS, suggestColumns, TRIAL_BALANCE_FIELDS } from "@/domain/imports/fields";
import { hasBlockingErrors } from "@/domain/imports/issues";
import type { RawTable } from "@/domain/imports/table";
import { analyzeTrialBalance, type TrialBalanceMapping } from "@/domain/imports/trial-balance";

const table = (rows: string[][]): RawTable => ({ format: "csv", rows });
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("Balance comptable", () => {
  const head = ["Compte", "Intitulé", "Mouvements débit", "Mouvements crédit", "Solde débit", "Solde crédit"];
  const map: TrialBalanceMapping = {
    headerRow: 0,
    amountMode: "debit_credit",
    columns: { account_number: 0, account_label: 1, movement_debit: 2, movement_credit: 3, closing_debit: 4, closing_credit: 5 },
  };

  it("propose la correspondance des colonnes d'après les en-têtes", () => {
    expect(suggestColumns(TRIAL_BALANCE_FIELDS, head)).toMatchObject({
      account_number: 0, account_label: 1, movement_debit: 2, movement_credit: 3, closing_debit: 4, closing_credit: 5, balance: null,
    });
  });

  it("balance équilibrée : lignes normalisées, totaux exacts, lignes de total ignorées", () => {
    const a = analyzeTrialBalance(
      table([
        head,
        ["401 000", "Fournisseurs", "500,00", "1 700,00", "", "1 200,00"],
        ["512000", "Banque", "3 000,00", "1 800,00", "1 200,00", ""],
        ["", "Total général", "3 500,00", "3 500,00", "1 200,00", "1 200,00"],
      ]),
      map,
    );
    expect(hasBlockingErrors(a.issues)).toBe(false);
    expect(a.lines.map((l) => [l.accountNumber, l.closingDebit, l.closingCredit])).toEqual([
      ["401000", "0.00", "1200.00"],
      ["512000", "1200.00", "0.00"],
    ]);
    expect(a.totals).toEqual({ closingDebit: "1200.00", closingCredit: "1200.00", movementDebit: "3500.00", movementCredit: "3500.00" });
    expect(a.ignoredRows).toEqual([4]);
  });

  it("balance déséquilibrée : rejet explicite avec l'écart", () => {
    const a = analyzeTrialBalance(table([head, ["401", "F", "", "", "", "1 200,00"], ["512", "B", "", "", "1 199,99", ""]]), map);
    const err = a.issues.find((i) => i.code === "unbalanced");
    expect(err?.severity).toBe("error");
    expect(err?.message).toContain("écart 0,01\u00a0€");
  });

  it("compte en double, solde des deux côtés, montant illisible : erreurs ligne à ligne", () => {
    const a = analyzeTrialBalance(
      table([head, ["401", "F", "", "", "", "100"], ["401", "F bis", "", "", "", "100"], ["512", "B", "", "", "100", "100"], ["606", "A", "", "", "1,2,3", ""]]),
      map,
    );
    expect(codes(a.issues)).toEqual(expect.arrayContaining(["duplicate_account", "both_sides", "invalid_amount"]));
    expect(a.issues.find((i) => i.code === "duplicate_account")?.row).toBe(3);
  });

  it("modes « solde signé » et « solde + sens »", () => {
    const signed = analyzeTrialBalance(table([["Compte", "Solde"], ["411", "1 000,00"], ["706", "-1 000,00"]]), {
      headerRow: 0, amountMode: "signed", columns: { account_number: 0, balance: 1 },
    });
    expect(signed.lines.map((l) => [l.closingDebit, l.closingCredit])).toEqual([["1000.00", "0.00"], ["0.00", "1000.00"]]);
    const dir = analyzeTrialBalance(table([["Compte", "Solde", "Sens"], ["411", "1 000,00", "D"], ["706", "1 000,00", "C"], ["607", "5,00", "X"]]), {
      headerRow: 0, amountMode: "amount_direction", columns: { account_number: 0, balance: 1, direction: 2 },
    });
    expect(codes(dir.issues)).toContain("invalid_direction");
  });

  it("correspondance incomplète : erreur explicite, aucune ligne", () => {
    const a = analyzeTrialBalance(table([head]), { headerRow: 0, amountMode: "debit_credit", columns: { account_number: 0 } });
    expect(codes(a.issues)).toEqual(["mapping_incomplete"]);
  });

  it("contrôle à-nouveau + mouvements = solde", () => {
    const a = analyzeTrialBalance(
      table([["Compte", "AN D", "AN C", "Mvt D", "Mvt C", "SD", "SC"], ["512", "100", "0", "50", "20", "131", ""], ["101", "0", "100", "0", "0", "", "100"], ["401", "", "", "20", "50", "", "31"]]),
      { headerRow: 0, amountMode: "debit_credit", columns: { account_number: 0, opening_debit: 1, opening_credit: 2, movement_debit: 3, movement_credit: 4, closing_debit: 5, closing_credit: 6 } },
    );
    expect(a.issues.filter((i) => i.code === "line_inconsistent").map((i) => i.row)).toEqual([2, 4]);
  });
});

describe("FEC", () => {
  const H = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"];
  const line = (num: string, date: string, acc: string, d: string, c: string, valid = "20250131") =>
    ["VT", "Ventes", num, date, acc, "Lib", "", "", "F1", date, "Facture", d, c, "", "", valid, "", ""];
  const ctx = { fiscalYear: { startDate: "2025-01-01", endDate: "2025-12-31" }, fileName: "732829320FEC20251231.txt", companySiren: "732829320" };

  it("FEC conforme : écritures équilibrées, aucune erreur", () => {
    const a = analyzeFec(table([H, line("1", "20250115", "411000", "1200,00", "0,00"), line("1", "20250115", "706000", "0,00", "1000,00"), line("1", "20250115", "445710", "0,00", "200,00")]), ctx);
    expect(hasBlockingErrors(a.issues)).toBe(false);
    expect(a.variant).toBe("debit_credit");
    expect(a.entryCount).toBe(1);
    expect(a.totals).toEqual({ debit: "1200.00", credit: "1200.00" });
    expect(a.lines[0]).toMatchObject({ entryDate: "2025-01-15", accountNumber: "411000", debit: "1200.00", credit: "0.00" });
  });

  it("variante Montant + Sens", () => {
    const H2 = H.slice(0, 11).concat(["Montant", "Sens"], H.slice(13));
    const r = (acc: string, m: string, s: string) => ["VT", "Ventes", "1", "20250115", acc, "L", "", "", "F1", "20250115", "Facture", m, s, "", "", "20250131", "", ""];
    const a = analyzeFec(table([H2, r("411", "100,00", "D"), r("706", "100,00", "C")]), ctx);
    expect(a.variant).toBe("amount_direction");
    expect(hasBlockingErrors(a.issues)).toBe(false);
  });

  it("rejette : en-tête absent, écriture déséquilibrée, date hors exercice, colonne manquante", () => {
    expect(codes(analyzeFec(table([["Compte", "Montant"]]), ctx).issues)).toEqual(["not_fec"]);
    const a = analyzeFec(table([H, line("1", "20250115", "411", "100,00", ""), line("1", "20250115", "706", "", "90,00"), line("2", "20260105", "512", "10,00", ""), line("2", "20260105", "", "", "10,00")]), ctx);
    expect(codes(a.issues)).toEqual(expect.arrayContaining(["unbalanced_entry", "out_of_fiscal_year", "missing_field"]));
    expect(hasBlockingErrors(a.issues)).toBe(true);
  });

  it("avertit : nom de fichier, SIREN, écritures non validées", () => {
    const a = analyzeFec(table([H, line("1", "20250115", "411", "10,00", "", ""), line("1", "20250115", "706", "", "10,00", "")]), { ...ctx, fileName: "export.txt" });
    expect(codes(a.issues)).toEqual(expect.arrayContaining(["file_name", "unvalidated"]));
    const b = analyzeFec(table([H, line("1", "20250115", "411", "10,00", ""), line("1", "20250115", "706", "", "10,00")]), { ...ctx, companySiren: "552100554" });
    expect(codes(b.issues)).toContain("siren_mismatch");
  });
});

describe("Relevé bancaire", () => {
  const head = ["Date", "Libellé", "Débit", "Crédit", "Solde"];
  const map: BankMapping = { headerRow: 0, amountMode: "debit_credit", columns: { date: 0, label: 1, debit: 2, credit: 3, balance: 4 } };

  it("propose la correspondance des colonnes", () => {
    expect(suggestColumns(BANK_FIELDS, head)).toMatchObject({ date: 0, label: 1, debit: 2, credit: 3, balance: 4, amount: null });
  });

  it("débit = sortie (négatif), crédit = entrée ; solde courant cohérent", () => {
    const a = analyzeBank(table([head, ["02/01/2025", "PRLV URSSAF", "1 000,00", "", "4 000,00"], ["03/01/2025", "VIR CLIENT A", "", "2 500,00", "6 500,00"]]), map);
    expect(hasBlockingErrors(a.issues)).toBe(false);
    expect(a.lines.map((l) => l.amount)).toEqual(["-1000.00", "2500.00"]);
    expect(a.totals).toMatchObject({ inflows: "2500.00", outflows: "-1000.00", net: "1500.00", first: "2025-01-02", last: "2025-01-03" });
    expect(a.runningBalance).toEqual({ status: "consistent", closing: "6500.00", closingDate: "2025-01-03" });
  });

  it("fichier trié du plus récent au plus ancien : solde cohérent aussi", () => {
    const a = analyzeBank(table([head, ["03/01/2025", "VIR CLIENT A", "", "2 500,00", "6 500,00"], ["02/01/2025", "PRLV URSSAF", "1 000,00", "", "4 000,00"]]), map);
    expect(a.runningBalance.status).toBe("consistent");
    expect(a.runningBalance.closing).toBe("6500.00");
  });

  it("solde incohérent (opération manquante) : avertissement", () => {
    const a = analyzeBank(table([head, ["02/01/2025", "A", "100,00", "", "900,00"], ["03/01/2025", "B", "100,00", "", "700,00"]]), map);
    expect(codes(a.issues)).toContain("balance_break");
  });

  it("opérations identiques le même jour : clés distinctes, stables d'un import à l'autre", () => {
    const rows = [head, ["02/01/2025", "CB BOULANGERIE", "4,50", "", ""], ["02/01/2025", "CB BOULANGERIE", "4,50", "", ""]];
    const a = analyzeBank(table(rows), map);
    const b = analyzeBank(table(rows), map);
    expect(new Set(a.lines.map((l) => l.naturalKey)).size).toBe(2);
    expect(a.lines.map((l) => l.naturalKey)).toEqual(b.lines.map((l) => l.naturalKey));
  });

  it("erreurs : date invalide, débit et crédit renseignés, montant manquant", () => {
    const a = analyzeBank(table([head, ["32/01/2025", "X", "1,00", "", ""], ["02/01/2025", "Y", "1,00", "1,00", ""], ["02/01/2025", "Z", "", "", ""]]), map);
    expect(codes(a.issues)).toEqual(expect.arrayContaining(["invalid_date", "both_sides", "missing_amount"]));
    expect(a.lines).toHaveLength(0);
  });

  it("mode montant signé", () => {
    const a = analyzeBank(table([["Date opération", "Libellé", "Montant"], ["2025-01-02", "VIR", "-12,30"]]), {
      headerRow: 0, amountMode: "signed", columns: { date: 0, label: 1, amount: 2 },
    });
    expect(a.lines[0].amount).toBe("-12.30");
  });
});

describe("Plan de comptes → PCG", () => {
  it("normalise et rattache les comptes numériques", () => {
    expect(normalizeAccountNumber(" 401.000 ")).toBe("401000");
    expect(pcgRoot("40100000")).toBe("401");
    expect(pcgRoot("10000000")).toBe("100");
    expect(classifyAccount("60610000")).toMatchObject({ pcgAccount: "6061", pcgClass: 6, status: "auto_validated", isAuxiliary: false });
    expect(classifyAccount("401DUPONT")).toMatchObject({ pcgAccount: "401", isAuxiliary: true, status: "auto_validated" });
  });
  it("comptes non numériques, classe 0 ou 9 : à vérifier", () => {
    expect(classifyAccount("FDUPONT").status).toBe("to_review");
    expect(classifyAccount("9010").status).toBe("to_review");
    expect(classifyAccount("12").status).toBe("to_review");
  });
  it("règles sauvegardées : exacte prioritaire, sinon préfixe le plus long", () => {
    const rules = [
      { id: "r1", matchType: "prefix" as const, pattern: "F", pcgAccount: "401" },
      { id: "r2", matchType: "prefix" as const, pattern: "FIMMO", pcgAccount: "404" },
      { id: "r3", matchType: "exact" as const, pattern: "FIMMO1", pcgAccount: "4041" },
    ];
    expect(classifyAccount("FDUPONT", rules)).toMatchObject({ pcgAccount: "401", ruleId: "r1", status: "auto_validated" });
    expect(classifyAccount("FIMMO2", rules)).toMatchObject({ pcgAccount: "404", ruleId: "r2" });
    expect(classifyAccount("FIMMO1", rules)).toMatchObject({ pcgAccount: "4041", ruleId: "r3" });
  });
});
