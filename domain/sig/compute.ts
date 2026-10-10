import { lineNature, resolveAccount, type Resolution } from "./rules";
import type {
  AccountBalance, AggregateDef, Contribution, LineCode, Override, RowCode, RuleSet, SigRow,
} from "./types";

/**
 * Moteur de calcul des SIG : déterministe, sans effet de bord, en centimes entiers.
 * Entrée : soldes par compte sur la période (une seule source), exceptions de l'entreprise.
 * Sortie : tableau des SIG avec le détail par compte, comptes non rattachés et rapprochement
 * indépendant du résultat. Aucune ligne d'équilibrage n'est jamais créée.
 */

export type UnresolvedAccount = {
  account: string;
  label: string;
  pcgAccount: string | null;
  net: bigint;
  reason: "no_pcg" | "review" | "removed" | "unassigned";
  proposal: LineCode | null;
  note: string | null;
};

export type SigComputation = {
  ruleSet: { code: RuleSet["code"]; version: number };
  rows: SigRow[];
  unresolved: UnresolvedAccount[];
  /** Comptes de classe 6/7 utilisés (avec un solde non nul). */
  plAccountCount: number;
  /** Rapprochement : résultat issu des SIG vs −Σ(débit − crédit) des classes 6 et 7, sans règle. */
  reconciliation: { sigResult: bigint; accountingResult: bigint; gap: bigint };
  overridesUsed: { account: string; overrideId: string; line: LineCode; justification: string }[];
};

/** Classe comptable d'un compte : celle de son rattachement PCG, à défaut son premier chiffre. */
export function accountClass(b: Pick<AccountBalance, "account" | "pcgAccount">): string {
  return (b.pcgAccount ?? b.account).charAt(0);
}

export function isProfitAndLoss(b: Pick<AccountBalance, "account" | "pcgAccount">): boolean {
  const c = accountClass(b);
  return c === "6" || c === "7";
}

export function computeSig(rs: RuleSet, balances: readonly AccountBalance[], overrides: readonly Override[]): SigComputation {
  const byAccount = new Map(overrides.map((o) => [o.account, o]));
  const contributions = new Map<LineCode, Contribution[]>(rs.lines.map((l) => [l.code, []]));
  const unresolved: UnresolvedAccount[] = [];
  const overridesUsed: SigComputation["overridesUsed"] = [];
  let accountingResult = 0n;
  let plAccountCount = 0;

  const sorted = [...balances].sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
  for (const b of sorted) {
    if (!isProfitAndLoss(b)) continue;
    accountingResult -= b.net;
    if (b.net === 0n && !b.debit && !b.credit) continue;
    plAccountCount++;
    if (!b.pcgAccount) {
      unresolved.push({ account: b.account, label: b.label, pcgAccount: null, net: b.net, reason: "no_pcg", proposal: null, note: null });
      continue;
    }
    const ov = byAccount.get(b.account);
    const res: Resolution = resolveAccount(rs, b.pcgAccount, ov);
    if (res.status === "rule" || res.status === "override") {
      const nature = lineNature(rs, res.line);
      const via: Contribution["via"] = res.status === "rule"
        ? { kind: "rule", prefix: res.rule.prefix, reference: res.rule.reference }
        : { kind: "override", overrideId: res.overrideId, justification: res.justification };
      if (res.status === "override") overridesUsed.push({ account: b.account, overrideId: res.overrideId, line: res.line, justification: res.justification });
      contributions.get(res.line)!.push({
        account: b.account, label: b.label, pcgAccount: b.pcgAccount, via,
        amount: nature === "product" ? -b.net : b.net,
        debit: b.debit, credit: b.credit, origin: b.origin,
      });
      continue;
    }
    unresolved.push({
      account: b.account, label: b.label, pcgAccount: b.pcgAccount, net: b.net,
      reason: res.status,
      proposal: res.status === "unassigned" ? null : res.proposal,
      note: res.status === "unassigned" ? null : res.rule.note ?? null,
    });
  }

  const values = new Map<RowCode, bigint>();
  for (const [code, list] of contributions) values.set(code, list.reduce((s, c) => s + c.amount, 0n));
  const aggregates = new Map<RowCode, AggregateDef>(rs.aggregates.map((a) => [a.code, a]));
  const evaluate = (code: RowCode, stack: RowCode[] = []): bigint => {
    const known = values.get(code);
    if (known !== undefined) return known;
    const agg = aggregates.get(code);
    if (!agg || stack.includes(code)) throw new Error(`Formule SIG invalide : ${code}`);
    const v = agg.terms.reduce((s, t) => s + BigInt(t.sign) * evaluate(t.ref, [...stack, code]), 0n);
    values.set(code, v);
    return v;
  };

  const SOLDES = new Set<RowCode>([
    "MARGE_COMMERCIALE", "PRODUCTION_EXERCICE", "VALEUR_AJOUTEE", "EBE", "RESULTAT_EXPLOITATION",
    "RESULTAT_COURANT_AVANT_IMPOTS", "RESULTAT_EXCEPTIONNEL", "RESULTAT_NET",
  ]);
  const rows: SigRow[] = rs.layout.map(({ ref, level }) => {
    const line = rs.lines.find((l) => l.code === ref);
    return {
      code: ref,
      label: line?.label ?? aggregates.get(ref)!.label,
      kind: line ? "line" : SOLDES.has(ref) ? "solde" : "subtotal",
      level,
      value: evaluate(ref),
      contributions: line ? contributions.get(line.code)! : [],
    };
  });

  const sigResult = evaluate("RESULTAT_NET");
  return {
    ruleSet: { code: rs.code, version: rs.version },
    rows,
    unresolved,
    plAccountCount,
    reconciliation: { sigResult, accountingResult, gap: sigResult - accountingResult },
    overridesUsed,
  };
}

/** Comptes de gestion dont le solde diffère entre deux sources (au centime). */
export function compareSources(a: readonly AccountBalance[], b: readonly AccountBalance[]) {
  const net = (list: readonly AccountBalance[]) => {
    const m = new Map<string, { label: string; net: bigint }>();
    for (const x of list) if (isProfitAndLoss(x)) m.set(x.account, { label: x.label, net: (m.get(x.account)?.net ?? 0n) + x.net });
    return m;
  };
  const ma = net(a);
  const mb = net(b);
  const out: { account: string; label: string; a: bigint; b: bigint }[] = [];
  for (const acc of [...new Set([...ma.keys(), ...mb.keys()])].sort()) {
    const va = ma.get(acc)?.net ?? 0n;
    const vb = mb.get(acc)?.net ?? 0n;
    if (va !== vb) out.push({ account: acc, label: ma.get(acc)?.label || mb.get(acc)?.label || "", a: va, b: vb });
  }
  return out;
}

/** Soldes d'un mois = cumul à fin de mois − cumul à fin du mois précédent (même exercice, même source). */
export function differenceBalances(end: readonly AccountBalance[], previous: readonly AccountBalance[]): AccountBalance[] {
  const prev = new Map(previous.map((p) => [p.account, p]));
  const out: AccountBalance[] = [];
  const seen = new Set<string>();
  for (const e of end) {
    seen.add(e.account);
    const p = prev.get(e.account);
    out.push({
      ...e, net: e.net - (p?.net ?? 0n), debit: null, credit: null,
      origin: p ? { ...e.origin, minus: { importId: p.origin.importId, fileName: p.origin.fileName, rows: p.origin.rows } } : e.origin,
    });
  }
  for (const p of previous) {
    if (seen.has(p.account)) continue;
    out.push({ ...p, net: -p.net, debit: null, credit: null, origin: { importId: end[0]?.origin.importId ?? p.origin.importId, fileName: end[0]?.origin.fileName ?? null, minus: p.origin } });
  }
  return out;
}
