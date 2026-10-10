import type { SigComputation, UnresolvedAccount } from "./compute";
import type { Period } from "./periods";
import type { RuleSet, SigCheck, SourceKind } from "./types";

/**
 * Contrôles du calcul. Un contrôle « bloquant » interdit la validation et la publication ;
 * un « avertissement » est affiché et conservé dans la version figée.
 */

export const SOURCE_LABELS: Record<SourceKind, string> = {
  trial_balance: "Balance comptable",
  fec: "FEC (écritures comptables)",
};

export type SourceDiagnostic = {
  kind: SourceKind;
  /** Données provisoires (balance provisoire, FEC d'un exercice non clôturé…). */
  provisional: boolean;
  /** FEC : dernière date d'écriture ; balance : date d'arrêté utilisée. */
  coveredUntil: string | null;
  /** Écritures de clôture (solde des comptes 6/7 vers le 12) dans le FEC. */
  closingEntries: { entryNumber: string; journal: string; date: string }[];
};

export type CheckContext = {
  ruleSet: RuleSet;
  period: Period;
  computation: SigComputation;
  source: SourceDiagnostic;
  /** Écarts entre balance et FEC (null si une seule source est disponible). */
  divergence: { accounts: { account: string; label: string; a: bigint; b: bigint }[]; explicitChoice: boolean } | null;
  /** Comparaison N-1 : null si aucune donnée N-1. */
  comparison: { ruleSetCode: string; months: number; available: boolean } | null;
  /** Exercice non clos à la date de fin de période (période en cours). */
  fiscalYearOpen: boolean;
};

const REASONS: Record<UnresolvedAccount["reason"], string> = {
  no_pcg: "Compte non rattaché au plan comptable général",
  review: "Classement à confirmer",
  removed: "Compte supprimé par le PCG 2025",
  unassigned: "Aucune rubrique SIG ne correspond",
};

export function buildChecks(ctx: CheckContext): SigCheck[] {
  const checks: SigCheck[] = [];
  const c = ctx.computation;

  if (c.plAccountCount === 0) {
    checks.push({
      code: "no_pl_accounts", severity: "blocking",
      title: "Aucun compte de charges ou de produits",
      explanation: "La source ne contient aucun compte de classe 6 ou 7 avec un solde sur la période : les SIG ne peuvent pas être établis.",
    });
  }

  const noPcg = c.unresolved.filter((u) => u.reason === "no_pcg");
  if (noPcg.length) {
    checks.push({
      code: "account_without_pcg", severity: "blocking",
      title: "Comptes sans rattachement PCG",
      explanation: "Rattachez ces comptes au plan comptable général (page « Plan de comptes ») avant tout calcul définitif.",
      accounts: noPcg.map((u) => ({ account: u.account, label: u.label, amount: u.net })),
    });
  }
  const toClassify = c.unresolved.filter((u) => u.reason !== "no_pcg");
  if (toClassify.length) {
    checks.push({
      code: "account_without_rubric", severity: "blocking",
      title: "Comptes de gestion sans rubrique SIG",
      explanation: "Ces comptes ne sont pas rattachés automatiquement : choisissez leur rubrique et justifiez-la (exception propre à l'entreprise).",
      accounts: toClassify.map((u) => ({ account: u.account, label: u.label, amount: u.net, detail: [REASONS[u.reason], u.note].filter(Boolean).join(" — ") })),
    });
  }

  if (c.reconciliation.gap !== 0n) {
    checks.push({
      code: "result_mismatch", severity: "blocking",
      title: "Le résultat des SIG ne correspond pas au résultat comptable",
      explanation: "Le résultat de l'exercice issu des SIG diffère du solde des comptes de classes 6 et 7. Aucune ligne d'équilibrage n'est créée : l'écart vient des comptes non classés ci-dessus.",
      amount: c.reconciliation.gap,
    });
  }

  if (ctx.source.closingEntries.length) {
    checks.push({
      code: "closing_entries", severity: "blocking",
      title: "Écritures de clôture présentes dans le FEC",
      explanation: "Des écritures soldent les comptes de charges et de produits vers le compte de résultat (12) : elles annuleraient les SIG. Utilisez la balance avant clôture ou un FEC sans écritures de détermination du résultat.",
      accounts: ctx.source.closingEntries.slice(0, 20).map((e) => ({ account: e.entryNumber, label: `Journal ${e.journal} du ${e.date}`, amount: 0n })),
    });
  }

  if (ctx.divergence && ctx.divergence.accounts.length) {
    checks.push({
      code: "sources_diverge", severity: ctx.divergence.explicitChoice ? "warning" : "blocking",
      title: "La balance et le FEC ne concordent pas",
      explanation: ctx.divergence.explicitChoice
        ? `Source retenue explicitement par le DAF : ${SOURCE_LABELS[ctx.source.kind]}. Les écarts restent tracés.`
        : "Les deux sources donnent des soldes différents pour les comptes ci-dessous. Choisissez explicitement la source à retenir, avec une justification.",
      accounts: ctx.divergence.accounts.map((d) => ({ account: d.account, label: d.label, amount: d.a - d.b, detail: `Balance ${fmt(d.a)} / FEC ${fmt(d.b)} (débit − crédit)` })),
    });
  }

  if (ctx.source.provisional || ctx.fiscalYearOpen) {
    checks.push({
      code: "provisional_data", severity: "warning",
      title: "Données provisoires",
      explanation: ctx.fiscalYearOpen
        ? "L'exercice n'est pas clôturé : les SIG portent sur des données en cours (écritures d'inventaire possiblement absentes)."
        : "La source est marquée provisoire : les montants peuvent encore évoluer.",
    });
  }

  if (!ctx.comparison || !ctx.comparison.available) {
    checks.push({ code: "no_previous", severity: "warning", title: "Données N-1 indisponibles", explanation: "Aucune donnée exploitable pour la période équivalente de l'exercice précédent : aucune variation n'est calculée." });
  } else {
    if (ctx.comparison.months !== ctx.period.months) {
      checks.push({
        code: "durations_differ", severity: "warning", title: "Durées non comparables",
        explanation: `La période N couvre ${ctx.period.months} mois, la période N-1 ${ctx.comparison.months} mois : les variations doivent être lues avec prudence.`,
      });
    }
    if (ctx.comparison.ruleSetCode !== ctx.ruleSet.code) {
      checks.push({
        code: "rule_sets_differ", severity: "warning", title: "Référentiels comptables différents entre N et N-1",
        explanation: `N est établi selon ${ctx.ruleSet.code}, N-1 selon ${ctx.comparison.ruleSetCode} (règlement ANC 2022-06) : le résultat exceptionnel, les transferts de charges et les cessions ne sont pas présentés de la même façon.`,
      });
    }
  }

  if (c.overridesUsed.length) {
    checks.push({
      code: "overrides_used", severity: "warning",
      title: "Exceptions de classement appliquées",
      explanation: "Ces comptes sont classés selon une décision propre à l'entreprise, et non selon le référentiel commun.",
      accounts: c.overridesUsed.map((o) => ({ account: o.account, label: o.justification, amount: 0n, detail: o.line })),
    });
  }

  if (ctx.ruleSet.code === "PCG-2025") {
    const exc = c.rows.find((r) => r.code === "RESULTAT_EXCEPTIONNEL");
    if (exc && exc.value !== 0n) {
      checks.push({
        code: "exceptional_2025", severity: "warning", title: "Résultat exceptionnel non nul (PCG 2025)",
        explanation: "Depuis 2025, le résultat exceptionnel est réservé aux événements majeurs et inhabituels : vérifiez que les montants de 678/778 le justifient.",
        amount: exc.value,
      });
    }
  }
  return checks;
}

function fmt(cents: bigint) {
  const neg = cents < 0n;
  const a = neg ? -cents : cents;
  const euros = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "−" : ""}${euros},${(a % 100n).toString().padStart(2, "0")} €`;
}

export const hasBlocking = (checks: readonly SigCheck[]) => checks.some((c) => c.severity === "blocking");
