import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { buildChecks, hasBlocking } from "@/domain/sig/checks";
import { compareSources, computeSig, differenceBalances, type SigComputation } from "@/domain/sig/compute";
import { comparisonPeriod, fiscalMonths, frDate, previousFiscalYear, resolvePeriod, type FiscalYearRef, type Period, type PeriodKind } from "@/domain/sig/periods";
import {
  centsToDecimal, contentHash, decideSource, rulesHash, serializeChecks, serializeRows,
  type SnapshotContent, type SourceAvailability, type SourceRequest,
} from "@/domain/sig/report";
import { ENGINE_VERSION, matchRule, RULE_SETS, ruleSetFor } from "@/domain/sig/rules";
import type { AccountBalance, LineCode, RuleSet, RuleSetCode, SigCheck, SourceKind } from "@/domain/sig/types";
import { withUser, type RuntimeTx } from "@/lib/db/tenant";
import { AccessDeniedError, BusinessRuleError, ValidationError } from "@/lib/errors";
import { insertAudit } from "@/repositories/audit";
import { listFiscalYears } from "@/repositories/fiscal-years";
import {
  dataFingerprint, fecAccountEntries, fecAccounts, fecClosingEntries, findCurrentFec, findSnapshot, insertApproval,
  insertSnapshot, listActiveOverrides, listApprovals, listCurrentTrialBalances, listOverrideHistory, listSnapshots,
  publishSnapshot, replaceOverride, trialBalanceAccounts, userNames,
} from "@/repositories/sig";
import { staffMfaSatisfied, type Actor } from "./actor";
import { authorizeCompany, recordDenied } from "./authorize";

/**
 * Service SIG : assemble les sources d'une période, appelle le moteur (domain/sig), produit le
 * calcul provisoire, les versions figées (validation) et leur publication. Une seule source par
 * calcul ; la banque n'est jamais utilisée.
 */

const paramsSchema = z.object({
  fiscalYearId: z.uuid(),
  period: z.enum(["fiscal_year", "ytd", "month"]).default("fiscal_year"),
  month: z.coerce.number().int().min(1).max(24).nullable().default(null),
  source: z.enum(["auto", "trial_balance", "fec"]).default("auto"),
  justification: z.string().trim().max(500).nullable().default(null),
});
export type SigParams = z.input<typeof paramsSchema>;

function parseParams(raw: SigParams) {
  const p = paramsSchema.safeParse(raw);
  if (!p.success) throw new ValidationError("Paramètres invalides");
  return { ...p.data, month: p.data.period === "fiscal_year" ? null : p.data.month ?? 1 };
}

type Loaded = { balances: AccountBalance[]; refs: SnapshotContent["source"]["refs"]; provisional: boolean };

type PeriodSources = {
  availability: Record<SourceKind, SourceAvailability>;
  load: Record<SourceKind, () => Promise<Loaded>>;
  fecId: string | null;
  fecCoveredUntil: string | null;
};

/** Sources utilisables pour une période (sans rien additionner ni reconstituer arbitrairement). */
async function periodSources(tx: RuntimeTx, companyId: string, fy: FiscalYearRef, period: Period): Promise<PeriodSources> {
  const tbs = await listCurrentTrialBalances(tx, companyId, fy.id);
  const tbAt = (d: string) => tbs.find((t) => t.periodEnd === d) ?? null;
  const end = tbAt(period.end);
  let tbAvail: SourceAvailability;
  let tbLoad: () => Promise<Loaded> = async () => ({ balances: [], refs: [], provisional: false });
  if (!end) {
    tbAvail = { available: false, reason: `Aucune balance arrêtée au ${frDate(period.end)} pour cet exercice.` };
  } else if (period.kind === "month" && period.month! > 1) {
    const prevEnd = fiscalMonths(fy)[period.month! - 2].end;
    const prev = tbAt(prevEnd);
    if (!prev) {
      tbAvail = { available: false, reason: `Le mois isolé exige aussi la balance arrêtée au ${frDate(prevEnd)} (fin du mois précédent).` };
    } else {
      tbAvail = { available: true };
      tbLoad = async () => {
        const [a, b] = await Promise.all([trialBalanceAccounts(tx, companyId, end), trialBalanceAccounts(tx, companyId, prev)]);
        return {
          balances: differenceBalances(a, b),
          refs: [
            { importId: end.importId, fileName: end.fileName, role: `Balance au ${frDate(end.periodEnd)}` },
            { importId: prev.importId, fileName: prev.fileName, role: `Balance au ${frDate(prev.periodEnd)} (soustraite)` },
          ],
          provisional: end.dataStatus === "provisional" || prev.dataStatus === "provisional",
        };
      };
    }
  } else {
    tbAvail = { available: true };
    tbLoad = async () => ({
      balances: await trialBalanceAccounts(tx, companyId, end),
      refs: [{ importId: end.importId, fileName: end.fileName, role: `Balance au ${frDate(end.periodEnd)}` }],
      provisional: end.dataStatus === "provisional",
    });
  }

  const fec = await findCurrentFec(tx, companyId, fy.id);
  let fecAvail: SourceAvailability;
  if (!fec) fecAvail = { available: false, reason: "Aucun FEC enregistré pour cet exercice." };
  else if (!fec.last || fec.last < period.end.slice(0, 8) + "01") {
    // Aucune écriture dans le dernier mois de la période : le FEC ne couvre pas la période.
    fecAvail = { available: false, reason: `FEC incomplet pour la période : dernière écriture au ${fec.last ? frDate(fec.last) : "—"}.` };
  } else fecAvail = { available: true };
  const fecLoad = async (): Promise<Loaded> => ({
    balances: await fecAccounts(tx, companyId, { id: fec!.id, fileName: fec!.fileName }, period.start, period.end),
    refs: [{ importId: fec!.id, fileName: fec!.fileName, role: `FEC (écritures du ${frDate(period.start)} au ${frDate(period.end)})` }],
    provisional: false,
  });
  return { availability: { trial_balance: tbAvail, fec: fecAvail }, load: { trial_balance: tbLoad, fec: fecLoad }, fecId: fec?.id ?? null, fecCoveredUntil: fec?.last ?? null };
}

export type SigReport = Awaited<ReturnType<typeof buildReport>>;

async function buildReport(tx: RuntimeTx, companyId: string, firmId: string, raw: SigParams) {
  const params = parseParams(raw);
  const years = (await listFiscalYears(tx, companyId)).map((f) => ({ id: f.id, label: f.label, startDate: f.startDate, endDate: f.endDate, status: f.status }));
  const fy = years.find((f) => f.id === params.fiscalYearId);
  if (!fy) throw new AccessDeniedError("fiscal_year_not_found");
  const period = resolvePeriod(fy, params.period as PeriodKind, params.month);
  if (!period) throw new ValidationError("Mois hors de l'exercice");
  const rs = ruleSetFor(fy.startDate);
  const hash = rulesHash(rs);
  const approvals = await listApprovals(tx, firmId);
  const approved = approvals.some((a) => a.ruleSetCode === rs.code && a.rulesHash === hash);

  const sources = await periodSources(tx, companyId, fy, period);
  const decision = decideSource(sources.availability, params.source as SourceRequest, params.justification);
  const prevFy = previousFiscalYear(fy, years);
  const fingerprint = `${await dataFingerprint(tx, companyId, fy.id)}:${prevFy ? await dataFingerprint(tx, companyId, prevFy.id) : "-"}`;
  const base = {
    params, fiscalYears: years, fiscalYear: fy, period, ruleSet: rs, rulesHash: hash, approved,
    availability: sources.availability, previousFiscalYearId: prevFy?.id ?? null, fingerprint,
  };
  if (!decision.ok) return { ...base, status: "insufficient" as const, reason: decision.reason };

  const overrides = await listActiveOverrides(tx, companyId, rs.code);
  const loaded = await sources.load[decision.kind]();
  const computation = computeSig(rs, loaded.balances, overrides);

  let divergence: { accounts: ReturnType<typeof compareSources>; explicitChoice: boolean } | null = null;
  if (decision.compareWith) {
    const other = await sources.load[decision.compareWith]();
    const [tbSide, fecSide] = decision.kind === "trial_balance" ? [loaded.balances, other.balances] : [other.balances, loaded.balances];
    divergence = { accounts: compareSources(tbSide, fecSide), explicitChoice: decision.choice === "explicit" };
  }
  const closing = decision.kind === "fec" && sources.fecId ? await fecClosingEntries(tx, companyId, sources.fecId, period.start, period.end) : [];

  // N-1 : même période relative, même logique de source (automatique), avec son propre référentiel.
  let previous: SigComputation | null = null;
  let comparison: SnapshotContent["comparison"] = { available: false, reason: "Données N-1 indisponibles : aucun exercice précédent." };
  const prevPeriod = comparisonPeriod(period, prevFy);
  if (prevFy && !prevPeriod) comparison = { available: false, reason: "Données N-1 indisponibles : période équivalente absente de l'exercice précédent." };
  if (prevFy && prevPeriod) {
    const prs = ruleSetFor(prevFy.startDate);
    const ps = await periodSources(tx, companyId, prevFy, prevPeriod);
    const pd = decideSource(ps.availability, "auto", null);
    if (!pd.ok) comparison = { available: false, reason: `Données N-1 indisponibles : ${pd.reason}` };
    else {
      const pc = computeSig(prs, (await ps.load[pd.kind]()).balances, await listActiveOverrides(tx, companyId, prs.code));
      if (pc.unresolved.length || pc.reconciliation.gap !== 0n || pc.plAccountCount === 0) {
        comparison = { available: false, reason: "Données N-1 indisponibles : comptes N-1 non classés ou résultat N-1 non rapproché." };
      } else {
        previous = pc;
        comparison = { available: true, period: { start: prevPeriod.start, end: prevPeriod.end, label: prevPeriod.label, months: prevPeriod.months }, ruleSetCode: prs.code, source: pd.kind };
      }
    }
  }

  const checks: SigCheck[] = buildChecks({
    ruleSet: rs, period, computation,
    source: { kind: decision.kind, provisional: loaded.provisional, coveredUntil: decision.kind === "fec" ? sources.fecCoveredUntil : period.end, closingEntries: closing },
    divergence,
    comparison: comparison.available ? { ruleSetCode: comparison.ruleSetCode, months: comparison.period.months, available: true } : null,
    fiscalYearOpen: fy.status === "open",
    definitive: decision.kind === "trial_balance" ? !loaded.provisional : fy.status !== "open",
  });
  if (comparison.available === false && checks.some((c) => c.code === "no_previous")) {
    const c = checks.find((x) => x.code === "no_previous")!;
    c.explanation = comparison.reason;
  }

  const content: SnapshotContent = {
    format: 1,
    period: { kind: period.kind, month: period.month, start: period.start, end: period.end, label: period.label, months: period.months },
    fiscalYear: { id: fy.id, label: fy.label, startDate: fy.startDate, endDate: fy.endDate },
    ruleSet: { code: rs.code, version: rs.version, label: rs.label, hash },
    engineVersion: ENGINE_VERSION,
    source: { kind: decision.kind, choice: decision.choice, justification: decision.justification, refs: loaded.refs, provisional: loaded.provisional || fy.status === "open" },
    comparison,
    rows: serializeRows(rs, computation, previous),
    reconciliation: {
      sigResult: centsToDecimal(computation.reconciliation.sigResult),
      accountingResult: centsToDecimal(computation.reconciliation.accountingResult),
      gap: centsToDecimal(computation.reconciliation.gap),
    },
    checks: serializeChecks(checks),
  };
  return {
    ...base, status: "computed" as const, decision, content, contentHash: contentHash(content),
    blocking: hasBlocking(checks), unresolved: computation.unresolved, fecId: sources.fecId,
  };
}

function staffOnly(role: string) {
  if (role !== "firm_admin" && role !== "firm_analyst") throw new AccessDeniedError("staff_only");
}

/** Snapshot obsolète : données (empreinte) ou référentiel modifiés depuis la validation. */
function isObsolete(s: { dataFingerprint: string; rulesHash: string; ruleSetCode: string }, currentFingerprint: string | null) {
  const rs = RULE_SETS[s.ruleSetCode as RuleSetCode];
  return !rs || rulesHash(rs) !== s.rulesHash || (currentFingerprint !== null && currentFingerprint !== s.dataFingerprint);
}

async function snapshotsWithState(tx: RuntimeTx, companyId: string, onlyPublished: boolean, fiscalYears: { id: string; startDate: string; endDate: string; label: string }[]) {
  const list = await listSnapshots(tx, companyId, onlyPublished);
  const fps = new Map<string, string>();
  const fp = async (fyId: string) => {
    if (!fps.has(fyId)) {
      const fy = fiscalYears.find((f) => f.id === fyId)!;
      const prev = previousFiscalYear(fy, fiscalYears);
      fps.set(fyId, `${await dataFingerprint(tx, companyId, fyId)}:${prev ? await dataFingerprint(tx, companyId, prev.id) : "-"}`);
    }
    return fps.get(fyId)!;
  };
  const names = await userNames(tx, [...new Set(list.flatMap((s) => [s.validatedBy, s.publishedBy].filter((x): x is string => !!x)))]);
  const out = [];
  for (const s of list) {
    out.push({
      ...s,
      obsolete: isObsolete(s, await fp(s.fiscalYearId)),
      validatedByName: names.get(s.validatedBy) ?? null,
      publishedByName: s.publishedBy ? names.get(s.publishedBy) ?? null : null,
    });
  }
  return out;
}

// ───────────── Espace DAF ─────────────

/** Calcul provisoire (jamais enregistré) + historique des versions figées. */
export async function getSigWorkspace(actor: Actor, companyId: string, raw: Partial<SigParams>) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "sig", "read");
    staffOnly(access.role);
    const years = await listFiscalYears(tx, companyId);
    const snapshots = await snapshotsWithState(tx, companyId, false, years);
    if (!years.length) return { access, years, report: null, snapshots, overrides: [] };
    const fiscalYearId = raw.fiscalYearId && years.some((y) => y.id === raw.fiscalYearId) ? raw.fiscalYearId : years[years.length - 1].id;
    const report = await buildReport(tx, companyId, access.company.firmId, { ...raw, fiscalYearId });
    const overrides = await listOverrideHistory(tx, companyId);
    return { access, years, report, snapshots, overrides };
  });
}

/** Validation par le DAF : recalcul, contrôle de l'empreinte affichée, version figée immuable. */
export async function validateSig(actor: Actor, companyId: string, raw: SigParams, expectedContentHash: string) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "sig", "validate");
    const r = await buildReport(tx, companyId, access.company.firmId, raw);
    if (r.status !== "computed") throw new BusinessRuleError("sig_insufficient", r.reason);
    if (r.blocking) throw new BusinessRuleError("sig_blocking", "Des contrôles bloquants empêchent la validation.");
    if (r.contentHash !== expectedContentHash) {
      throw new BusinessRuleError("sig_changed", "Les données ont changé depuis l'affichage : vérifiez le nouveau calcul avant de valider.");
    }
    const [{ v }] = await tx.execute<{ v: number }>(sql`select data_version as v from app.companies where id = ${companyId}`);
    const { id } = await insertSnapshot(tx, {
      companyId, fiscalYearId: r.fiscalYear.id, periodKind: r.period.kind, periodMonth: r.period.month,
      periodStart: r.period.start, periodEnd: r.period.end, source: r.decision.kind, sourceChoice: r.decision.choice,
      sourceJustification: r.decision.justification,
      sourceRefs: { refs: r.content.source.refs, previousFiscalYearId: r.previousFiscalYearId },
      ruleSetCode: r.ruleSet.code, ruleSetVersion: r.ruleSet.version, rulesHash: r.rulesHash, engineVersion: ENGINE_VERSION,
      dataFingerprint: r.fingerprint, dataVersion: Number(v), content: r.content, contentHash: r.contentHash, validatedBy: actor.userId,
    });
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "sig.validate", objectType: "sig_snapshot", objectId: id, outcome: "success",
      details: {
        period: `${r.period.start}/${r.period.end}`, source: r.decision.kind, sourceChoice: r.decision.choice,
        justification: r.decision.justification, ruleSet: r.ruleSet.code, contentHash: r.contentHash,
        warnings: r.content.checks.map((c) => c.code),
      },
    });
    return { id };
  });
}

/** Publication (administrateur DAF) : jamais automatique, jamais d'une version obsolète. */
export async function publishSig(actor: Actor, companyId: string, snapshotId: string) {
  if (!z.uuid().safeParse(snapshotId).success) throw new AccessDeniedError("snapshot_not_found");
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "sig", "publish");
    const s = await findSnapshot(tx, companyId, snapshotId);
    if (!s) throw new AccessDeniedError("snapshot_not_found");
    if (s.status !== "validated") throw new BusinessRuleError("sig_already_published", "Cette version est déjà publiée.");
    const years = await listFiscalYears(tx, companyId);
    const fy = years.find((y) => y.id === s.fiscalYearId)!;
    const prev = previousFiscalYear(fy, years);
    const fp = `${await dataFingerprint(tx, companyId, fy.id)}:${prev ? await dataFingerprint(tx, companyId, prev.id) : "-"}`;
    if (isObsolete(s, fp)) throw new BusinessRuleError("sig_obsolete", "Version obsolète : les données ou les règles ont changé depuis la validation. Recalculez et validez à nouveau.");
    const approvals = await listApprovals(tx, access.company.firmId);
    if (!approvals.some((a) => a.ruleSetCode === s.ruleSetCode && a.rulesHash === s.rulesHash)) {
      throw new BusinessRuleError("sig_rules_not_approved", `Le référentiel ${s.ruleSetCode} n'a pas encore été validé par le cabinet (page « Référentiel SIG »).`);
    }
    if (!(await publishSnapshot(tx, companyId, snapshotId, actor.userId))) throw new BusinessRuleError("sig_already_published", "Cette version est déjà publiée.");
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "sig.publish", objectType: "sig_snapshot", objectId: snapshotId, outcome: "success", details: { contentHash: s.contentHash },
    });
  });
}

export async function getSnapshot(actor: Actor, companyId: string, snapshotId: string) {
  if (!z.uuid().safeParse(snapshotId).success) throw new AccessDeniedError("snapshot_not_found");
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "sig", "read");
    const s = await findSnapshot(tx, companyId, snapshotId);
    const staff = access.role === "firm_admin" || access.role === "firm_analyst";
    if (!s || (!staff && s.status !== "published")) throw new AccessDeniedError("snapshot_not_found");
    const years = await listFiscalYears(tx, companyId);
    const state = (await snapshotsWithState(tx, companyId, !staff, years)).find((x) => x.id === s.id)!;
    const content = s.content as SnapshotContent;
    return { access, snapshot: state, content: staff ? content : clientView(content), integrity: contentHash(s.content as SnapshotContent) === s.contentHash };
  });
}

/** Justification d'un compte : écritures du FEC courant sur la période. */
export async function getAccountEntries(actor: Actor, companyId: string, fiscalYearId: string, account: string, start: string, end: string) {
  const ok = z.object({ fy: z.uuid(), account: z.string().min(1).max(40), start: z.iso.date(), end: z.iso.date() }).safeParse({ fy: fiscalYearId, account, start, end });
  if (!ok.success) throw new AccessDeniedError("invalid_params");
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "sig", "read");
    staffOnly(access.role);
    const fec = await findCurrentFec(tx, companyId, fiscalYearId);
    if (!fec) return { fec: null, entries: [] };
    return { fec, entries: await fecAccountEntries(tx, companyId, fec.id, account, start, end) };
  });
}

// ───────────── Exceptions et référentiel ─────────────

const overrideSchema = z.object({
  ruleSetCode: z.enum(["PCG-2024", "PCG-2025"]),
  account: z.string().trim().min(1).max(40),
  line: z.string().min(1),
  justification: z.string().trim().min(5, "Justification obligatoire (5 caractères au moins)").max(500),
});

export async function setAccountOverride(actor: Actor, companyId: string, raw: unknown) {
  const p = overrideSchema.safeParse(raw);
  if (!p.success) {
    const out: Record<string, string[]> = {};
    for (const i of p.error.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
    throw new ValidationError("Formulaire invalide", out);
  }
  const rs: RuleSet = RULE_SETS[p.data.ruleSetCode];
  if (!rs.lines.some((l) => l.code === p.data.line)) throw new ValidationError("Formulaire invalide", { line: ["Rubrique inconnue"] });
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "sig_rules", "update");
    const [acc] = await tx.execute<{ pcg: string | null }>(sql`select pcg_account as pcg from app.chart_of_accounts where company_id = ${companyId} and account_number = ${p.data.account}`);
    if (!acc) throw new ValidationError("Formulaire invalide", { account: ["Compte absent du plan de comptes de l'entreprise"] });
    if (!acc.pcg || !/^[67]/.test(acc.pcg)) throw new ValidationError("Formulaire invalide", { account: ["Seuls les comptes rattachés aux classes 6 et 7 du PCG peuvent être classés"] });
    const proposal = matchRule(rs, acc.pcg)?.line ?? null;
    const r = await replaceOverride(tx, {
      companyId, ruleSetCode: rs.code, accountNumber: p.data.account, pcgAccount: acc.pcg, proposedLine: proposal,
      line: p.data.line as LineCode, justification: p.data.justification, userId: actor.userId,
    });
    await tx.execute(sql`select app.bump_data_version(${companyId}::uuid)`);
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: access.company.firmId, companyId,
      action: "sig.override", objectType: "sig_account_override", objectId: r.id, outcome: "success",
      details: { ruleSet: rs.code, account: p.data.account, pcg: acc.pcg, proposed: proposal, line: p.data.line, replaced: r.replacedId, justification: p.data.justification },
    });
    return r;
  });
}

export async function getRuleSetsOverview(actor: Actor) {
  const firm = actor.firms[0];
  if (!firm) throw new AccessDeniedError("staff_only");
  return withUser(actor.userId, async (tx) => {
    const approvals = await listApprovals(tx, firm.firmId);
    return {
      firm, canApprove: firm.role === "firm_admin",
      ruleSets: Object.values(RULE_SETS).map((rs) => {
        const hash = rulesHash(rs);
        return { ruleSet: rs, hash, approval: approvals.find((a) => a.ruleSetCode === rs.code && a.rulesHash === hash) ?? null };
      }),
      history: approvals,
    };
  });
}

export async function approveRuleSet(actor: Actor, ruleSetCode: string) {
  const firm = actor.firms.find((f) => f.role === "firm_admin");
  if (!firm || !staffMfaSatisfied(actor) || !(ruleSetCode in RULE_SETS)) {
    await recordDenied(actor, { action: "sig_rules.approve", reason: firm ? "mfa_or_code" : "not_firm_admin" });
    throw new AccessDeniedError("sig_rules_approve");
  }
  const rs = RULE_SETS[ruleSetCode as RuleSetCode];
  const hash = rulesHash(rs);
  await withUser(actor.userId, async (tx) => {
    await insertApproval(tx, { firmId: firm.firmId, ruleSetCode: rs.code, ruleSetVersion: rs.version, rulesHash: hash, userId: actor.userId });
    await insertAudit(tx, {
      actorUserId: actor.userId, actorKind: "user", firmId: firm.firmId, action: "sig_rules.approve",
      objectType: "sig_rule_set", objectId: `${rs.code}@${rs.version}`, outcome: "success", details: { rulesHash: hash },
    });
  });
}

// ───────────── Portail client ─────────────

/** Vue client : soldes principaux uniquement, sans détail interne ni justification. */
export function clientView(c: SnapshotContent): SnapshotContent {
  return {
    ...c,
    source: { ...c.source, justification: null, refs: [] },
    rows: c.rows.filter((r) => r.kind === "solde" || r.code === "CHIFFRE_AFFAIRES").map((r) => ({ ...r, contributions: [] })),
    checks: c.checks.filter((x) => ["no_previous", "provisional_data", "durations_differ", "rule_sets_differ"].includes(x.code))
      .map((x) => ({ ...x, accounts: [] })),
  };
}

/** Portail client (et son aperçu par le DAF) : versions publiées uniquement, vue simplifiée. */
export async function getPublishedSig(actor: Actor, companyId: string, snapshotId?: string | null) {
  return withUser(actor.userId, async (tx) => {
    const access = await authorizeCompany(tx, actor, companyId, "sig", "read");
    const years = await listFiscalYears(tx, companyId);
    const published = await snapshotsWithState(tx, companyId, true, years);
    const selected = published.find((p) => p.id === snapshotId) ?? published[0] ?? null;
    const row = selected ? await findSnapshot(tx, companyId, selected.id) : null;
    return { access, published, selected, content: row && row.status === "published" ? clientView(row.content as SnapshotContent) : null };
  });
}
