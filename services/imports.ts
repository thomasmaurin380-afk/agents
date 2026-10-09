import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { classifyAccount } from "@/domain/imports/accounts";
import { formatAmountFr } from "@/domain/imports/amounts";
import { analyzeBank, type BankAnalysis, type BankMapping } from "@/domain/imports/bank";
import { analyzeFec, type FecAnalysis } from "@/domain/imports/fec";
import { BANK_FIELDS, IMPORT_KIND_LABELS, suggestColumns, TRIAL_BALANCE_FIELDS, type ImportKind } from "@/domain/imports/fields";
import { countByCode, hasBlockingErrors, warning, type ImportIssue } from "@/domain/imports/issues";
import { detectHeaderRow, headerSignature, headersAt, cellText, type RawTable } from "@/domain/imports/table";
import { analyzeTrialBalance, type TrialBalanceAnalysis, type TrialBalanceMapping } from "@/domain/imports/trial-balance";
import { withUser, type RuntimeTx } from "@/lib/db/tenant";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import { MAX_IMPORT_BYTES, readTable, UnreadableFileError } from "@/lib/imports/read-table";
import { getStorage } from "@/lib/storage";
import {
  existingAccounts, fillMissingAccountLabels, findCurrentTrialBalance, insertAccountingEntries, insertAccounts,
  insertTrialBalance, insertTrialBalanceLines, listMappingRules, retireTrialBalance,
} from "@/repositories/accounting";
import { insertAudit } from "@/repositories/audit";
import { existingTransactionHashes, findBankAccount, insertBankTransactions, listBankAccounts } from "@/repositories/bank-accounts";
import { findFiscalYear, listFiscalYears } from "@/repositories/fiscal-years";
import {
  findCommittedBySha, findCurrentFec, findImportFile, findTemplate, insertImportFile, insertImportRows,
  listImportFiles, updateImportFile, upsertTemplate, type ImportFileRow,
} from "@/repositories/imports";
import type { Actor } from "./actor";
import { authorizeCompany } from "./authorize";

/**
 * Moteur d'import : téléversement → lecture → correspondance → prévisualisation → contrôles →
 * doublons → validation → enregistrement → rapport. Toute l'analyse est recalculée côté serveur
 * à partir du fichier original stocké (jamais à partir de données renvoyées par le navigateur).
 */

const ISSUES_IN_REPORT = 500;
const PREVIEW_ROWS = 30;

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function staffOnly(access: { role: string }) {
  if (access.role !== "firm_admin" && access.role !== "firm_analyst") throw new AccessDeniedError("staff_only");
}

// ───────────────────────────── Téléversement ─────────────────────────────

const uploadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trial_balance"), fiscalYearId: uuid, periodEnd: isoDate, dataStatus: z.enum(["provisional", "final"]) }),
  z.object({ kind: z.literal("fec"), fiscalYearId: uuid }),
  z.object({ kind: z.literal("bank_transactions"), bankAccountId: uuid }),
]);

export type UploadInput = z.input<typeof uploadSchema> & { file: { name: string; type: string; bytes: Uint8Array } };

export async function uploadImport(actor: Actor, companyId: string, input: UploadInput) {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Paramètres d'import invalides", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message]])));
  }
  const p = parsed.data;
  const { file } = input;
  if (file.bytes.length === 0) throw new ValidationError("Formulaire invalide", { file: ["Le fichier est vide."] });
  if (file.bytes.length > MAX_IMPORT_BYTES) throw new ValidationError("Formulaire invalide", { file: ["Fichier trop volumineux (20 Mo maximum)."] });
  const name = file.name.replace(/[\\/]/g, "_").slice(0, 200) || "fichier";
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");

  // Le fichier doit être lisible avant d'être accepté.
  try {
    await readTable(file.bytes, p.kind);
  } catch (e) {
    if (e instanceof UnreadableFileError) throw new ValidationError("Fichier illisible", { file: [e.message] });
    throw e;
  }

  const id = randomUUID();
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "imports", "create");
    staffOnly(access);
    if (p.kind === "trial_balance") {
      const fy = await findFiscalYear(tx, companyId, p.fiscalYearId);
      if (!fy) throw new ValidationError("Formulaire invalide", { fiscalYearId: ["Exercice introuvable."] });
      if (p.periodEnd < fy.startDate || p.periodEnd > fy.endDate) {
        throw new ValidationError("Formulaire invalide", { periodEnd: [`La date d'arrêté doit être comprise dans l'exercice (${fy.startDate} → ${fy.endDate}).`] });
      }
    } else if (p.kind === "fec") {
      if (!(await findFiscalYear(tx, companyId, p.fiscalYearId))) throw new ValidationError("Formulaire invalide", { fiscalYearId: ["Exercice introuvable."] });
    } else if (!(await findBankAccount(tx, companyId, p.bankAccountId))) {
      throw new ValidationError("Formulaire invalide", { bankAccountId: ["Compte bancaire introuvable."] });
    }
    const already = await findCommittedBySha(tx, companyId, sha256);
    if (already) {
      throw new BusinessRuleError(
        "duplicate_file",
        `Ce fichier a déjà été importé (« ${already.originalName} »). Un même fichier ne peut pas être enregistré deux fois.`,
      );
    }
    const storageKey = `${companyId}/imports/${sha256}`;
    await getStorage().put(storageKey, file.bytes, file.type || "application/octet-stream");
    await insertImportFile(
      tx,
      {
        companyId,
        kind: p.kind,
        originalName: name,
        mimeType: file.type || null,
        sizeBytes: file.bytes.length,
        sha256,
        storageKey,
        fiscalYearId: "fiscalYearId" in p ? p.fiscalYearId : null,
        periodEnd: p.kind === "trial_balance" ? p.periodEnd : null,
        dataStatus: p.kind === "trial_balance" ? p.dataStatus : null,
        bankAccountId: p.kind === "bank_transactions" ? p.bankAccountId : null,
        createdBy: actor.userId,
      },
      id,
    );
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "import.upload", objectType: "import_file", objectId: id, outcome: "success",
      details: { kind: p.kind, sizeBytes: file.bytes.length, sha256 },
    });
    return { id };
  });
}

// ───────────────────────────── Correspondance des colonnes ─────────────────────────────

const columnIndex = z.number().int().min(0).max(500).nullable().optional();
const tbMappingSchema = z.object({
  headerRow: z.number().int().min(0).max(1000),
  amountMode: z.enum(["debit_credit", "signed", "amount_direction"]),
  columns: z.object(Object.fromEntries(TRIAL_BALANCE_FIELDS.map((f) => [f.key, columnIndex]))),
});
const bankMappingSchema = z.object({
  headerRow: z.number().int().min(0).max(1000),
  amountMode: z.enum(["signed", "debit_credit"]),
  columns: z.object(Object.fromEntries(BANK_FIELDS.map((f) => [f.key, columnIndex]))),
});

function suggestMapping(kind: ImportKind, table: RawTable): TrialBalanceMapping | BankMapping | null {
  if (kind === "fec") return null;
  const headerRow = detectHeaderRow(table.rows);
  const headers = headersAt(table.rows, headerRow);
  if (kind === "trial_balance") {
    const columns = suggestColumns(TRIAL_BALANCE_FIELDS, headers);
    const amountMode =
      columns.closing_debit != null && columns.closing_credit != null ? "debit_credit" : columns.direction != null ? "amount_direction" : "signed";
    return { headerRow, amountMode, columns } as TrialBalanceMapping;
  }
  const columns = suggestColumns(BANK_FIELDS, headers);
  return { headerRow, amountMode: columns.amount != null ? "signed" : "debit_credit", columns } as BankMapping;
}

// ───────────────────────────── Analyse ─────────────────────────────

type Loaded = { file: ImportFileRow; table: RawTable };

async function loadImport(tx: RuntimeTx, companyId: string, importId: string): Promise<Loaded> {
  if (!uuid.safeParse(importId).success) throw new AccessDeniedError("not_found");
  const file = await findImportFile(tx, companyId, importId);
  if (!file) throw new AccessDeniedError("not_found");
  const bytes = await getStorage().get(file.storageKey);
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    throw new BusinessRuleError("integrity", "Le fichier stocké ne correspond plus à son empreinte : import bloqué.");
  }
  return { file, table: await readTable(bytes, file.kind) };
}

export type PreparedImport = {
  kind: ImportKind;
  mapping: TrialBalanceMapping | BankMapping | null;
  mappingSource: "saved" | "template" | "suggested" | "fixed";
  headers: string[];
  rawPreview: string[][];
  issues: ImportIssue[];
  blocking: boolean;
  summary: Record<string, string | number | null>;
  previewLines: Record<string, string | number | null>[];
  supersedes: { label: string } | null;
  duplicates: number;
  analysis: TrialBalanceAnalysis | FecAnalysis | (BankAnalysis & { hashes: string[]; duplicateHashes: Set<string> });
};

function bankHash(bankAccountId: string, naturalKey: string) {
  return createHash("sha256").update(`${bankAccountId}|${naturalKey}`).digest("hex");
}

async function prepare(tx: RuntimeTx, companyId: string, loaded: Loaded, siren: string | null): Promise<PreparedImport> {
  const { file, table } = loaded;
  let mapping = file.mapping as TrialBalanceMapping | BankMapping | null;
  let mappingSource: PreparedImport["mappingSource"] = mapping ? "saved" : "suggested";
  if (file.kind === "fec") mappingSource = "fixed";
  else if (!mapping) {
    const suggestion = suggestMapping(file.kind, table)!;
    const template = await findTemplate(tx, companyId, file.kind, headerSignature(headersAt(table.rows, suggestion.headerRow)));
    mapping = (template?.mapping as typeof suggestion | undefined) ?? suggestion;
    if (template) mappingSource = "template";
  }
  const headerRow = mapping?.headerRow ?? 0;
  const headers = headersAt(table.rows, headerRow);
  const rawPreview = table.rows.slice(headerRow + 1, headerRow + 1 + 8).map((r) => r.map(cellText));
  let supersedes: PreparedImport["supersedes"] = null;
  let duplicates = 0;

  if (file.kind === "trial_balance") {
    const a = analyzeTrialBalance(table, mapping as TrialBalanceMapping);
    const current = await findCurrentTrialBalance(tx, companyId, file.fiscalYearId!, file.periodEnd!);
    if (current) {
      supersedes = { label: `balance au ${file.periodEnd} déjà enregistrée` };
      a.issues.push(warning("supersedes", `Une balance au ${file.periodEnd} existe déjà pour cet exercice : elle sera remplacée (et conservée dans l'historique).`));
    }
    return {
      kind: file.kind, mapping, mappingSource, headers, rawPreview, issues: a.issues, blocking: hasBlockingErrors(a.issues),
      summary: {
        "Lignes de comptes": a.lines.length, "Lignes ignorées": a.ignoredRows.length,
        "Total soldes débiteurs": a.totals.closingDebit, "Total soldes créditeurs": a.totals.closingCredit,
        "Total mouvements débit": a.totals.movementDebit, "Total mouvements crédit": a.totals.movementCredit,
      },
      previewLines: a.lines.slice(0, PREVIEW_ROWS).map((l) => ({
        Ligne: l.sourceRow, Compte: l.accountNumber, Libellé: l.accountLabel, "Solde débit": l.closingDebit, "Solde crédit": l.closingCredit,
      })),
      supersedes, duplicates, analysis: a,
    };
  }

  if (file.kind === "fec") {
    const fy = await findFiscalYear(tx, companyId, file.fiscalYearId!);
    const a = analyzeFec(table, { fiscalYear: { startDate: fy!.startDate, endDate: fy!.endDate }, fileName: file.originalName, companySiren: siren });
    const current = await findCurrentFec(tx, companyId, file.fiscalYearId!);
    if (current && current.id !== file.id) {
      supersedes = { label: `FEC « ${current.originalName} »` };
      a.issues.push(warning("supersedes", `Un FEC est déjà enregistré pour cet exercice (« ${current.originalName} ») : il sera remplacé (et conservé dans l'historique).`));
    }
    return {
      kind: file.kind, mapping: null, mappingSource, headers, rawPreview: table.rows.slice(1, 9).map((r) => r.map(cellText)),
      issues: a.issues, blocking: hasBlockingErrors(a.issues),
      summary: {
        "Lignes d'écritures": a.lines.length, Écritures: a.entryCount, "Total débit": a.totals.debit, "Total crédit": a.totals.credit,
        "Première date": a.period.first, "Dernière date": a.period.last, "Lignes non validées": a.unvalidatedLines,
      },
      previewLines: a.lines.slice(0, PREVIEW_ROWS).map((l) => ({
        Ligne: l.sourceRow, Journal: l.journalCode, Écriture: l.entryNumber, Date: l.entryDate, Compte: l.accountNumber, Libellé: l.label, Débit: l.debit, Crédit: l.credit,
      })),
      supersedes, duplicates, analysis: a,
    };
  }

  const a = analyzeBank(table, mapping as BankMapping);
  const hashes = a.lines.map((l) => bankHash(file.bankAccountId!, l.naturalKey));
  const duplicateHashes = await existingTransactionHashes(tx, companyId, file.bankAccountId!, hashes);
  duplicates = duplicateHashes.size;
  if (duplicates > 0) {
    a.issues.push(warning("duplicates", `${duplicates} opération(s) déjà enregistrée(s) seront ignorées (doublons).`));
    if (duplicates === a.lines.length && a.lines.length > 0) {
      a.issues.push(warning("nothing_new", "Toutes les opérations de ce fichier sont déjà enregistrées : aucune nouvelle donnée."));
    }
  }
  return {
    kind: file.kind, mapping, mappingSource, headers, rawPreview, issues: a.issues, blocking: hasBlockingErrors(a.issues),
    summary: {
      Opérations: a.lines.length, "Nouvelles opérations": a.lines.length - duplicates, Doublons: duplicates,
      Encaissements: a.totals.inflows, Décaissements: a.totals.outflows, "Flux net": a.totals.net,
      "Première date": a.totals.first, "Dernière date": a.totals.last,
      "Contrôle du solde": a.runningBalance.status === "consistent" ? `cohérent (solde final ${formatAmountFr(a.runningBalance.closing!)})` : a.runningBalance.status === "inconsistent" ? "incohérent" : "non disponible",
    },
    previewLines: a.lines.slice(0, PREVIEW_ROWS).map((l, i) => ({
      Ligne: l.sourceRow, Date: l.bookingDate, Libellé: l.label, Montant: l.amount, Doublon: duplicateHashes.has(hashes[i]) ? "oui" : "",
    })),
    supersedes, duplicates, analysis: { ...a, hashes, duplicateHashes },
  };
}

/** Écran de travail d'un import : fichier, correspondance, prévisualisation, contrôles. */
export async function getImportWorkspace(actor: Actor, companyId: string, importId: string) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "imports", "read");
    staffOnly(access);
    const loaded = await loadImport(tx, companyId, importId);
    const fy = loaded.file.fiscalYearId ? await findFiscalYear(tx, companyId, loaded.file.fiscalYearId) : null;
    const bank = loaded.file.bankAccountId ? await findBankAccount(tx, companyId, loaded.file.bankAccountId) : null;
    const base = {
      company: access.company, role: access.role, file: loaded.file, fiscalYear: fy, bankAccount: bank,
      kindLabel: IMPORT_KIND_LABELS[loaded.file.kind],
    };
    if (loaded.file.status !== "uploaded" && loaded.file.status !== "mapped") return { ...base, prepared: null };
    const prepared = await prepare(tx, companyId, loaded, access.company.siren);
    const { analysis: _analysis, ...visible } = prepared;
    return {
      ...base,
      prepared: { ...visible, issues: visible.issues.slice(0, 300), issueCount: visible.issues.length, issuesByCode: countByCode(visible.issues) },
    };
  });
}

export async function saveMapping(actor: Actor, companyId: string, importId: string, raw: unknown) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "imports", "update");
    staffOnly(access);
    const file = uuid.safeParse(importId).success ? await findImportFile(tx, companyId, importId) : null;
    if (!file) throw new AccessDeniedError("not_found");
    if (file.status !== "uploaded" && file.status !== "mapped") throw new BusinessRuleError("closed", "Cet import n'est plus modifiable.");
    if (file.kind === "fec") throw new BusinessRuleError("fixed", "Le format FEC est normé : aucune correspondance à saisir.");
    const schema = file.kind === "trial_balance" ? tbMappingSchema : bankMappingSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ValidationError("Correspondance invalide");
    await updateImportFile(tx, companyId, importId, { mapping: parsed.data, status: "mapped" });
  });
}

export async function cancelImport(actor: Actor, companyId: string, importId: string) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "imports", "update");
    staffOnly(access);
    const file = uuid.safeParse(importId).success ? await findImportFile(tx, companyId, importId) : null;
    if (!file) throw new AccessDeniedError("not_found");
    if (file.status !== "uploaded" && file.status !== "mapped") throw new BusinessRuleError("closed", "Seul un import non validé peut être annulé.");
    await updateImportFile(tx, companyId, importId, { status: "cancelled" });
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "import.cancel", objectType: "import_file", objectId: importId, outcome: "success",
    });
  });
}

// ───────────────────────────── Validation et enregistrement ─────────────────────────────

const commitSchema = z.object({ confirmSupersede: z.boolean().default(false), saveTemplate: z.boolean().default(true) });

function rowStatus(issues: ImportIssue[]): "error" | "warning" | "ignored" {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.code === "ignored_line")) return "ignored";
  return "warning";
}

/** Valide l'import : nouvelle analyse complète, puis enregistrement atomique. */
export async function commitImport(actor: Actor, companyId: string, importId: string, raw: unknown) {
  const opts = commitSchema.parse(raw ?? {});
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "imports", "validate");
    staffOnly(access);
    const loaded = await loadImport(tx, companyId, importId);
    const { file, table } = loaded;
    if (file.status !== "uploaded" && file.status !== "mapped") throw new BusinessRuleError("closed", "Cet import a déjà été traité.");
    const prep = await prepare(tx, companyId, loaded, access.company.siren);
    if (prep.blocking) throw new BusinessRuleError("blocking_errors", "L'import comporte des erreurs bloquantes : corrigez le fichier ou la correspondance.");
    if (prep.supersedes && !opts.confirmSupersede) {
      throw new BusinessRuleError("confirm_supersede", `Confirmation requise : ${prep.supersedes.label} sera remplacé(e).`);
    }

    const counts: Record<string, number> = { lignesFichier: Math.max(0, table.rows.length - 1 - (prep.mapping?.headerRow ?? 0)) };
    let accounts: { number: string; label: string }[] = [];
    let supersededImportId: string | null = null;

    if (file.kind === "trial_balance") {
      const a = prep.analysis as TrialBalanceAnalysis;
      const current = await findCurrentTrialBalance(tx, companyId, file.fiscalYearId!, file.periodEnd!);
      if (current) {
        await retireTrialBalance(tx, companyId, current.id);
        await updateImportFile(tx, companyId, current.sourceImportId, { status: "superseded" });
        supersededImportId = current.sourceImportId;
      }
      const tb = await insertTrialBalance(tx, {
        companyId, fiscalYearId: file.fiscalYearId!, periodEnd: file.periodEnd!,
        dataStatus: file.dataStatus as "provisional" | "final", sourceImportId: file.id, supersedesId: current?.id ?? null,
        isCurrent: true, totalDebit: a.totals.closingDebit, totalCredit: a.totals.closingCredit, lineCount: a.lines.length,
      });
      await insertTrialBalanceLines(tx, a.lines.map((l) => ({
        trialBalanceId: tb.id, companyId, accountNumber: l.accountNumber, accountLabel: l.accountLabel,
        openingDebit: l.openingDebit, openingCredit: l.openingCredit, movementDebit: l.movementDebit, movementCredit: l.movementCredit,
        closingDebit: l.closingDebit, closingCredit: l.closingCredit, sourceRow: l.sourceRow,
      })));
      counts.lignesEnregistrees = a.lines.length;
      accounts = a.lines.map((l) => ({ number: l.accountNumber, label: l.accountLabel }));
    } else if (file.kind === "fec") {
      const a = prep.analysis as FecAnalysis;
      const current = await findCurrentFec(tx, companyId, file.fiscalYearId!);
      if (current) {
        await updateImportFile(tx, companyId, current.id, { status: "superseded" });
        supersededImportId = current.id;
      }
      await insertAccountingEntries(tx, a.lines.map((l) => ({
        companyId, fiscalYearId: file.fiscalYearId!, importFileId: file.id, journalCode: l.journalCode, journalLabel: l.journalLabel,
        entryNumber: l.entryNumber, entryDate: l.entryDate, accountNumber: l.accountNumber, accountLabel: l.accountLabel,
        auxAccount: l.auxAccount, auxLabel: l.auxLabel, pieceRef: l.pieceRef, pieceDate: l.pieceDate, label: l.label,
        debit: l.debit, credit: l.credit, lettering: l.lettering, letteringDate: l.letteringDate, validationDate: l.validationDate,
        currencyAmount: l.currencyAmount, currency: l.currency, sourceRow: l.sourceRow,
      })));
      counts.lignesEnregistrees = a.lines.length;
      counts.ecritures = a.entryCount;
      const labels = new Map<string, string>();
      for (const l of a.lines) if (!labels.get(l.accountNumber)) labels.set(l.accountNumber, l.accountLabel);
      accounts = [...labels].map(([number, label]) => ({ number, label }));
    } else {
      const a = prep.analysis as BankAnalysis & { hashes: string[]; duplicateHashes: Set<string> };
      const fresh = a.lines.map((l, i) => ({ l, h: a.hashes[i] })).filter(({ h }) => !a.duplicateHashes.has(h));
      const inserted = await insertBankTransactions(tx, fresh.map(({ l, h }) => ({
        companyId, bankAccountId: file.bankAccountId!, bookingDate: l.bookingDate, valueDate: l.valueDate, amount: l.amount,
        labelRaw: l.label, labelNormalized: l.labelNormalized, reference: l.reference, balanceAfter: l.balanceAfter,
        sourceImportId: file.id, sourceRow: l.sourceRow, naturalKeyHash: h,
      })));
      counts.lignesEnregistrees = inserted;
      counts.doublons = a.lines.length - inserted;
      // Lignes rejetées comme doublons : tracées.
      const dupRows = a.lines.filter((_, i) => a.duplicateHashes.has(a.hashes[i]));
      await insertImportRows(tx, dupRows.map((l) => ({
        importFileId: file.id, companyId, rowNumber: l.sourceRow, raw: (table.rows[l.sourceRow - 1] ?? []).map(cellText),
        status: "duplicate" as const, messages: [{ code: "duplicate", message: "Opération déjà enregistrée" }],
      })));
    }

    // Plan de comptes : nouveaux comptes classés (règles de l'entreprise), libellés complétés.
    let accountStats = { nouveaux: 0, aVerifier: 0 };
    if (accounts.length > 0) {
      const rules = await listMappingRules(tx, companyId);
      const existing = await existingAccounts(tx, companyId, accounts.map((a) => a.number));
      const fresh = accounts.filter((a) => !existing.has(a.number)).map((a) => ({ accountNumber: a.number, label: a.label, c: classifyAccount(a.number, rules) }));
      await insertAccounts(tx, companyId, file.id, fresh);
      await fillMissingAccountLabels(tx, companyId, accounts.filter((a) => existing.get(a.number)?.label === "" && a.label !== "").map((a) => ({ accountNumber: a.number, label: a.label })));
      accountStats = { nouveaux: fresh.length, aVerifier: fresh.filter((f) => f.c.status === "to_review").length };
    }

    // Lignes en anomalie (avertissements, exclusions) : tracées avec leur contenu brut.
    const byRow = new Map<number, ImportIssue[]>();
    for (const i of prep.issues) if (i.row != null) (byRow.get(i.row) ?? byRow.set(i.row, []).get(i.row)!).push(i);
    await insertImportRows(tx, [...byRow].map(([row, issues]) => ({
      importFileId: file.id, companyId, rowNumber: row, raw: (table.rows[row - 1] ?? []).map(cellText),
      status: rowStatus(issues), messages: issues.map((i) => ({ code: i.code, severity: i.severity, message: i.message, field: i.field })),
    })));

    const report = {
      format: table.format, encoding: table.encoding ?? null, delimiter: table.delimiter ?? null,
      headerRow: prep.mapping?.headerRow ?? 0, summary: prep.summary, counts, accounts: accountStats,
      supersededImportId, issuesByCode: countByCode(prep.issues), issues: prep.issues.slice(0, ISSUES_IN_REPORT),
      issueCount: prep.issues.length,
    };
    await updateImportFile(tx, companyId, file.id, {
      status: "committed", report, rowCount: counts.lignesEnregistrees, committedAt: new Date(), committedBy: actor.userId,
      mapping: prep.mapping,
    });
    if (opts.saveTemplate && prep.mapping && file.kind !== "fec") {
      await upsertTemplate(tx, {
        companyId, kind: file.kind, headerSignature: headerSignature(headersAt(table.rows, prep.mapping.headerRow)),
        mapping: prep.mapping, createdBy: actor.userId,
      });
    }
    await tx.execute(sqlBump(companyId));
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "import.commit", objectType: "import_file", objectId: file.id, outcome: "success",
      details: { kind: file.kind, counts, supersededImportId },
    });
    return { report };
  });
}

const sqlBump = (companyId: string) => sql`select app.bump_data_version(${companyId}::uuid)`;

// ───────────────────────────── Vue d'ensemble ─────────────────────────────

export async function getDataOverview(actor: Actor, companyId: string) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "accounting_data", "read");
    const [fiscalYears, bankAccounts, imports] = await Promise.all([
      listFiscalYears(tx, companyId),
      listBankAccounts(tx, companyId),
      listImportFiles(tx, companyId),
    ]);
    return { ...access, fiscalYears, bankAccounts, imports };
  });
}

