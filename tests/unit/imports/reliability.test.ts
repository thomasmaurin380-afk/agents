import { describe, expect, it } from "vitest";
import { analyzeBank, type BankMapping } from "@/domain/imports/bank";
import { columnLabel, issueCategory, ISSUE_HINTS, withColumns } from "@/domain/imports/issue-help";
import { warning } from "@/domain/imports/issues";
import { isMappingCompatible } from "@/domain/imports/mapping";
import type { RawTable } from "@/domain/imports/table";

const table = (rows: string[][]): RawTable => ({ format: "csv", rows });

describe("Sens des opérations bancaires (sans catégorie inventée)", () => {
  it("montant signé : positif = encaissement, négatif = décaissement, nul = à vérifier", () => {
    const m: BankMapping = { headerRow: 0, amountMode: "signed", columns: { date: 0, label: 1, amount: 2 } };
    const a = analyzeBank(table([["Date", "Libellé", "Montant"], ["01/01/2025", "VIR", "100,00"], ["02/01/2025", "PRLV", "-40,00"], ["03/01/2025", "AJUST", "0,00"]]), m);
    expect(a.lines.map((l) => [l.direction, l.reviewReason])).toEqual([["inflow", null], ["outflow", null], ["to_review", "Montant nul"]]);
    expect(a.totals).toMatchObject({ inflowCount: 1, outflowCount: 1, toReviewCount: 1 });
  });

  it("débit / crédit : colonne = sens ; montant négatif dans une colonne = à vérifier (signalé)", () => {
    const m: BankMapping = { headerRow: 0, amountMode: "debit_credit", columns: { date: 0, label: 1, debit: 2, credit: 3 } };
    const a = analyzeBank(
      table([["Date", "Libellé", "Débit", "Crédit"], ["01/01/2025", "PRLV", "40,00", ""], ["02/01/2025", "VIR", "", "100,00"], ["03/01/2025", "REGUL", "-5,00", ""]]),
      m,
    );
    expect(a.lines.map((l) => [l.amount, l.direction])).toEqual([["-40.00", "outflow"], ["100.00", "inflow"], ["-5.00", "to_review"]]);
    expect(a.issues.find((i) => i.code === "sign_mismatch")).toMatchObject({ row: 4, field: "debit", severity: "warning" });
    // La clé anti-doublon ne dépend pas du sens : compatibilité avec les opérations déjà importées.
    expect(a.lines[2].naturalKey).toBe("2025-01-03|-5.00|regul|#1");
  });
});

describe("Modèles de correspondance mémorisés", () => {
  it("compatible : mêmes colonnes ; incompatible : colonne hors fichier, champ obligatoire absent, mode inconnu", () => {
    const ok = { headerRow: 0, amountMode: "debit_credit", columns: { account_number: 0, closing_debit: 2, closing_credit: 3 } };
    expect(isMappingCompatible("trial_balance", ok, 4)).toBe(true);
    expect(isMappingCompatible("trial_balance", ok, 3)).toBe(false);
    expect(isMappingCompatible("trial_balance", { ...ok, columns: { closing_debit: 2, closing_credit: 3 } }, 4)).toBe(false);
    expect(isMappingCompatible("trial_balance", { ...ok, amountMode: "autre" }, 4)).toBe(false);
    expect(isMappingCompatible("bank_transactions", { headerRow: 0, amountMode: "signed", columns: { date: 0, label: 1, amount: 2 } }, 3)).toBe(true);
    expect(isMappingCompatible("bank_transactions", null, 3)).toBe(false);
  });
});

describe("Anomalies compréhensibles", () => {
  it("colonne concernée : depuis la correspondance ou le nom de colonne FEC", () => {
    expect(columnLabel("closing_debit", ["Compte", "Lib", "SD"], { closing_debit: 2 })).toBe("col. 3 « SD »");
    expect(columnLabel("EcritureDate", ["JournalCode", "EcritureDate"])).toBe("col. 2 « EcritureDate »");
    expect(columnLabel("inconnu", ["A"])).toBeUndefined();
    const [i] = withColumns([warning("invalid_value_date", "Date invalide", 3, "value_date")], ["Date", "Date valeur"], { value_date: 1 });
    expect(i.column).toBe("col. 2 « Date valeur »");
  });

  it("catégories : erreurs, avertissements, doublons ; chaque contrôle bloquant a une aide", () => {
    expect(issueCategory({ severity: "error", code: "unbalanced", message: "" })).toBe("error");
    expect(issueCategory({ severity: "warning", code: "duplicates", message: "" })).toBe("duplicate");
    expect(issueCategory({ severity: "warning", code: "missing_known", message: "" })).toBe("duplicate");
    expect(issueCategory({ severity: "warning", code: "zero_amount", message: "" })).toBe("warning");
    for (const code of ["invalid_amount", "invalid_date", "both_sides", "duplicate_account", "unbalanced", "unbalanced_entry", "out_of_fiscal_year", "not_fec", "mapping_incomplete"]) {
      expect(ISSUE_HINTS[code], code).toBeTruthy();
    }
  });
});

describe("Sécurité : aucune clé ou client d'administration côté navigateur", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = `${dir}/${f}`;
      return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(f) ? [p] : [];
    });
  it("les composants clients n'importent ni le stockage, ni l'administration Supabase, ni la clé de service", () => {
    const clientFiles = ["app", "components", "features"].flatMap(walk).filter((f) => /^["']use client["']/m.test(readFileSync(f, "utf8")));
    expect(clientFiles.length).toBeGreaterThan(5);
    for (const f of clientFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/SERVICE_ROLE|@\/lib\/storage|supabase-server|@supabase\//);
    }
  });
});
