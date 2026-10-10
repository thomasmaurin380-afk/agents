import type { AccountRule, AggregateDef, LineCode, LineDef, RowCode, RuleSet, RuleSetCode } from "./types";

/**
 * Référentiels SIG versionnés. Toute modification d'une règle impose d'incrémenter `version` :
 * l'empreinte du référentiel change, les versions figées antérieures deviennent « obsolètes » et
 * les hypothèses doivent être revalidées par le cabinet avant publication.
 *
 * Sources : PCG (règlement ANC n° 2014-03, art. 842-1 « tableau des soldes intermédiaires de
 * gestion ») ; règlement ANC n° 2022-06 et recueil ANC 2025 (exercices ouverts à compter du
 * 01/01/2025). Chaque règle indique son fondement : lecture du PCG ou convention de présentation
 * du cabinet. Voir docs/sig-rules.md (historique des corrections, choix à approuver).
 */

const P = "product" as const;
const C = "charge" as const;

const LINES = (reprisesLabel: string): LineDef[] => [
  { code: "VENTES_MARCHANDISES", label: "Ventes de marchandises", nature: P },
  { code: "ACHATS_MARCHANDISES", label: "Achats de marchandises", nature: C },
  { code: "VARIATION_STOCK_MARCHANDISES", label: "Variation de stock de marchandises", nature: C },
  { code: "PRODUCTION_VENDUE", label: "Production vendue (biens et services)", nature: P },
  { code: "PRODUCTION_STOCKEE", label: "Production stockée", nature: P },
  { code: "PRODUCTION_IMMOBILISEE", label: "Production immobilisée", nature: P },
  { code: "ACHATS_MATIERES", label: "Achats de matières premières et autres approvisionnements", nature: C },
  { code: "VARIATION_STOCK_MATIERES", label: "Variation de stock de matières et approvisionnements", nature: C },
  { code: "AUTRES_ACHATS_CHARGES_EXTERNES", label: "Autres achats et charges externes", nature: C },
  { code: "SUBVENTIONS_EXPLOITATION", label: "Subventions d'exploitation", nature: P },
  { code: "IMPOTS_TAXES", label: "Impôts, taxes et versements assimilés", nature: C },
  { code: "SALAIRES_TRAITEMENTS", label: "Salaires et traitements", nature: C },
  { code: "CHARGES_SOCIALES", label: "Charges sociales", nature: C },
  { code: "REPRISES_EXPLOITATION", label: reprisesLabel, nature: P },
  { code: "AUTRES_PRODUITS", label: "Autres produits de gestion courante", nature: P },
  { code: "DOTATIONS_EXPLOITATION", label: "Dotations aux amortissements, dépréciations et provisions", nature: C },
  { code: "AUTRES_CHARGES", label: "Autres charges de gestion courante", nature: C },
  { code: "QUOTE_PART_BENEFICE", label: "Quotes-parts de bénéfice sur opérations faites en commun", nature: P },
  { code: "QUOTE_PART_PERTE", label: "Quotes-parts de perte sur opérations faites en commun", nature: C },
  { code: "PRODUITS_FINANCIERS", label: "Produits financiers", nature: P },
  { code: "CHARGES_FINANCIERES", label: "Charges financières", nature: C },
  { code: "PRODUITS_EXCEPTIONNELS", label: "Produits exceptionnels", nature: P },
  { code: "CHARGES_EXCEPTIONNELLES", label: "Charges exceptionnelles", nature: C },
  { code: "PARTICIPATION", label: "Participation des salariés aux résultats", nature: C },
  { code: "IMPOTS_BENEFICES", label: "Impôts sur les bénéfices", nature: C },
];

const t = (ref: RowCode, sign: 1 | -1 = 1) => ({ ref, sign });

const AGGREGATES: AggregateDef[] = [
  {
    code: "CHIFFRE_AFFAIRES", label: "Chiffre d'affaires net",
    terms: [t("VENTES_MARCHANDISES"), t("PRODUCTION_VENDUE")],
    definition: "Ventes de marchandises + production vendue (base du « % du CA »).",
    clientExplanation: "Ce que l'entreprise a facturé sur la période (hors taxes).",
  },
  {
    code: "COUT_ACHAT_MARCHANDISES", label: "Coût d'achat des marchandises vendues",
    terms: [t("ACHATS_MARCHANDISES"), t("VARIATION_STOCK_MARCHANDISES")],
    definition: "Achats de marchandises (nets de rabais) + variation de stock de marchandises (6037).",
  },
  {
    code: "MARGE_COMMERCIALE", label: "Marge commerciale",
    terms: [t("VENTES_MARCHANDISES"), t("COUT_ACHAT_MARCHANDISES", -1)],
    definition: "Ventes de marchandises − coût d'achat des marchandises vendues.",
    clientExplanation: "Ce que rapporte la revente de marchandises, avant tous les autres frais.",
  },
  {
    code: "PRODUCTION_EXERCICE", label: "Production de l'exercice",
    terms: [t("PRODUCTION_VENDUE"), t("PRODUCTION_STOCKEE"), t("PRODUCTION_IMMOBILISEE")],
    definition: "Production vendue + production stockée + production immobilisée.",
    clientExplanation: "La valeur de ce que l'entreprise a produit (vendu, stocké ou utilisé pour elle-même).",
  },
  {
    code: "CONSOMMATIONS_TIERS", label: "Consommations en provenance de tiers",
    terms: [t("ACHATS_MATIERES"), t("VARIATION_STOCK_MATIERES"), t("AUTRES_ACHATS_CHARGES_EXTERNES")],
    definition: "Achats de matières et approvisionnements + variation de stock correspondante + autres achats et charges externes.",
  },
  {
    code: "VALEUR_AJOUTEE", label: "Valeur ajoutée",
    terms: [t("MARGE_COMMERCIALE"), t("PRODUCTION_EXERCICE"), t("CONSOMMATIONS_TIERS", -1)],
    definition: "Marge commerciale + production de l'exercice − consommations en provenance de tiers.",
    clientExplanation: "La richesse créée par l'entreprise, une fois payés ses fournisseurs et prestataires.",
  },
  {
    code: "CHARGES_PERSONNEL", label: "Charges de personnel",
    terms: [t("SALAIRES_TRAITEMENTS"), t("CHARGES_SOCIALES")],
    definition: "Salaires et traitements + charges sociales.",
  },
  {
    code: "EBE", label: "Excédent brut d'exploitation (EBE)",
    terms: [t("VALEUR_AJOUTEE"), t("SUBVENTIONS_EXPLOITATION"), t("IMPOTS_TAXES", -1), t("CHARGES_PERSONNEL", -1)],
    definition: "Valeur ajoutée + subventions d'exploitation − impôts et taxes − charges de personnel.",
    clientExplanation: "La performance de l'activité courante, avant amortissements, frais financiers et impôt.",
  },
  {
    code: "RESULTAT_EXPLOITATION", label: "Résultat d'exploitation",
    terms: [t("EBE"), t("REPRISES_EXPLOITATION"), t("AUTRES_PRODUITS"), t("DOTATIONS_EXPLOITATION", -1), t("AUTRES_CHARGES", -1)],
    definition: "EBE + reprises (et transferts de charges avant 2025) + autres produits − dotations − autres charges.",
    clientExplanation: "Le résultat de l'activité après amortissements et provisions.",
  },
  {
    code: "RESULTAT_COURANT_AVANT_IMPOTS", label: "Résultat courant avant impôts",
    terms: [
      t("RESULTAT_EXPLOITATION"), t("QUOTE_PART_BENEFICE"), t("QUOTE_PART_PERTE", -1),
      t("PRODUITS_FINANCIERS"), t("CHARGES_FINANCIERES", -1),
    ],
    definition: "Résultat d'exploitation ± quotes-parts sur opérations en commun + produits financiers − charges financières.",
    clientExplanation: "Le résultat de l'activité normale, frais et produits financiers compris.",
  },
  {
    code: "RESULTAT_EXCEPTIONNEL", label: "Résultat exceptionnel",
    terms: [t("PRODUITS_EXCEPTIONNELS"), t("CHARGES_EXCEPTIONNELLES", -1)],
    definition: "Produits exceptionnels − charges exceptionnelles.",
    clientExplanation: "Ce qui relève d'événements hors de l'activité normale.",
  },
  {
    code: "RESULTAT_NET", label: "Résultat de l'exercice",
    terms: [t("RESULTAT_COURANT_AVANT_IMPOTS"), t("RESULTAT_EXCEPTIONNEL"), t("PARTICIPATION", -1), t("IMPOTS_BENEFICES", -1)],
    definition: "Résultat courant avant impôts + résultat exceptionnel − participation des salariés − impôts sur les bénéfices.",
    clientExplanation: "Le bénéfice (ou la perte) final de la période.",
  },
];

const LAYOUT: RuleSet["layout"] = [
  { ref: "CHIFFRE_AFFAIRES", level: 0 },
  { ref: "VENTES_MARCHANDISES", level: 1 },
  { ref: "COUT_ACHAT_MARCHANDISES", level: 1 },
  { ref: "ACHATS_MARCHANDISES", level: 2 },
  { ref: "VARIATION_STOCK_MARCHANDISES", level: 2 },
  { ref: "MARGE_COMMERCIALE", level: 0 },
  { ref: "PRODUCTION_VENDUE", level: 1 },
  { ref: "PRODUCTION_STOCKEE", level: 1 },
  { ref: "PRODUCTION_IMMOBILISEE", level: 1 },
  { ref: "PRODUCTION_EXERCICE", level: 0 },
  { ref: "CONSOMMATIONS_TIERS", level: 1 },
  { ref: "ACHATS_MATIERES", level: 2 },
  { ref: "VARIATION_STOCK_MATIERES", level: 2 },
  { ref: "AUTRES_ACHATS_CHARGES_EXTERNES", level: 2 },
  { ref: "VALEUR_AJOUTEE", level: 0 },
  { ref: "SUBVENTIONS_EXPLOITATION", level: 1 },
  { ref: "IMPOTS_TAXES", level: 1 },
  { ref: "CHARGES_PERSONNEL", level: 1 },
  { ref: "SALAIRES_TRAITEMENTS", level: 2 },
  { ref: "CHARGES_SOCIALES", level: 2 },
  { ref: "EBE", level: 0 },
  { ref: "REPRISES_EXPLOITATION", level: 1 },
  { ref: "AUTRES_PRODUITS", level: 1 },
  { ref: "DOTATIONS_EXPLOITATION", level: 1 },
  { ref: "AUTRES_CHARGES", level: 1 },
  { ref: "RESULTAT_EXPLOITATION", level: 0 },
  { ref: "QUOTE_PART_BENEFICE", level: 1 },
  { ref: "QUOTE_PART_PERTE", level: 1 },
  { ref: "PRODUITS_FINANCIERS", level: 1 },
  { ref: "CHARGES_FINANCIERES", level: 1 },
  { ref: "RESULTAT_COURANT_AVANT_IMPOTS", level: 0 },
  { ref: "PRODUITS_EXCEPTIONNELS", level: 1 },
  { ref: "CHARGES_EXCEPTIONNELLES", level: 1 },
  { ref: "RESULTAT_EXCEPTIONNEL", level: 0 },
  { ref: "PARTICIPATION", level: 1 },
  { ref: "IMPOTS_BENEFICES", level: 1 },
  { ref: "RESULTAT_NET", level: 0 },
];

const REF_SIG = "PCG art. 842-1 (tableau des SIG, système développé)";
const REF_PCG25 = "PCG 2025 (règlement ANC n° 2022-06), plan de comptes";
const REF_RENVOI = "Recueil ANC des normes françaises (janvier 2025), renvois du tableau du compte de résultat : subdivisions à rattacher aux postes auxquels elles se rapportent";
const REF_CABINET = "Convention de présentation du cabinet (choix de gestion, non normatif)";
const DAF = "Classement à confirmer par le DAF";

type Opts = { note?: string; basis?: AccountRule["basis"]; reference?: string };
const certain = (prefix: string, line: LineCode, o: Opts = {}): AccountRule => ({ prefix, status: "certain", line, basis: o.basis ?? "pcg", reference: o.reference ?? REF_SIG, note: o.note });
const convention = (prefix: string, line: LineCode, note: string): AccountRule => ({ prefix, status: "certain", line, basis: "cabinet", reference: REF_CABINET, note });
const review = (prefix: string, line: LineCode | null, note: string, o: Omit<Opts, "note"> = {}): AccountRule => ({ prefix, status: "review", line, basis: o.basis ?? "pcg", reference: o.reference ?? DAF, note });
const transitional = (prefix: string, line: LineCode, note: string): AccountRule => ({ prefix, status: "transitional", line, basis: "pcg", reference: "PCG : compte utilisable en cours d'exercice seulement, à réimputer par nature à la clôture", note });
const removed = (prefix: string, line: LineCode | null, note: string): AccountRule => ({ prefix, status: "removed", line, basis: "pcg", reference: REF_PCG25, note });
const NO_MERCH = {
  condition: "no_merchandise_activity" as const,
  note: "Aucune vente ni achat de marchandises (707, 607, 6037, 6097, 7097) sur la période : le produit annexe ne peut se rapporter qu'à la production vendue.",
};

/** Règles communes aux deux référentiels (classes 6 et 7). */
const COMMON: AccountRule[] = [
  // 60 — Achats
  review("60", "AUTRES_ACHATS_CHARGES_EXTERNES", "Compte 60 sans subdivision : nature d'achat indéterminée."),
  certain("601", "ACHATS_MATIERES"),
  certain("602", "ACHATS_MATIERES"),
  review("603", "VARIATION_STOCK_MATIERES", "603 non subdivisé : variation de stock de matières (6031/6032) ou de marchandises (6037) ?"),
  certain("6031", "VARIATION_STOCK_MATIERES"),
  certain("6032", "VARIATION_STOCK_MATIERES"),
  certain("6037", "VARIATION_STOCK_MARCHANDISES"),
  certain("604", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("605", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("606", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("607", "ACHATS_MARCHANDISES"),
  review("608", "AUTRES_ACHATS_CHARGES_EXTERNES", "Frais accessoires d'achat : à rattacher aux achats auxquels ils se rapportent (marchandises, matières ou autres achats).", { reference: REF_RENVOI }),
  review("609", "AUTRES_ACHATS_CHARGES_EXTERNES", "Rabais, remises et ristournes obtenus non ventilés : à rattacher aux achats concernés.", { reference: REF_RENVOI }),
  certain("6091", "ACHATS_MATIERES"),
  certain("6092", "ACHATS_MATIERES"),
  certain("6094", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("6095", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("6096", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("6097", "ACHATS_MARCHANDISES"),
  review("6098", "AUTRES_ACHATS_CHARGES_EXTERNES", "Rabais, remises et ristournes non affectés : à rattacher aux achats auxquels ils se rapportent.", { reference: REF_RENVOI }),
  // 61-62 — Services extérieurs
  certain("61", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("62", "AUTRES_ACHATS_CHARGES_EXTERNES"),
  certain("621", "AUTRES_ACHATS_CHARGES_EXTERNES", { note: "Personnel extérieur à l'entreprise : charge externe selon le PCG (et non charge de personnel)." }),
  // 63-64 — Impôts, personnel
  certain("63", "IMPOTS_TAXES"),
  review("64", "SALAIRES_TRAITEMENTS", "Compte 64 non subdivisé : salaires (641/644) ou charges sociales (645/646/647) ?"),
  certain("641", "SALAIRES_TRAITEMENTS"),
  certain("644", "SALAIRES_TRAITEMENTS"),
  certain("645", "CHARGES_SOCIALES"),
  certain("646", "CHARGES_SOCIALES"),
  certain("647", "CHARGES_SOCIALES"),
  review("648", "SALAIRES_TRAITEMENTS", "Autres charges de personnel : à rattacher aux salaires ou aux charges sociales selon leur nature.", { reference: REF_RENVOI }),
  review("649", "SALAIRES_TRAITEMENTS", "Remboursements de charges de personnel : viennent en diminution des salaires ou des charges sociales remboursés (jamais en produit).", { reference: REF_RENVOI }),
  // 65-66
  certain("65", "AUTRES_CHARGES"),
  certain("655", "QUOTE_PART_PERTE"),
  certain("66", "CHARGES_FINANCIERES"),
  // 68-69
  review("68", null, "Compte 68 non subdivisé : dotation d'exploitation (681), financière (686) ou exceptionnelle (687) ?"),
  certain("681", "DOTATIONS_EXPLOITATION"),
  certain("686", "CHARGES_FINANCIERES"),
  certain("687", "CHARGES_EXCEPTIONNELLES"),
  review("689", null, "Engagements sur ressources affectées (entités à but non lucratif) : hors modèle SIG général."),
  review("69", null, "Compte 69 non subdivisé : participation (691) ou impôt (695 à 699) ?"),
  certain("691", "PARTICIPATION"),
  certain("695", "IMPOTS_BENEFICES"),
  certain("696", "IMPOTS_BENEFICES"),
  certain("697", "IMPOTS_BENEFICES"),
  certain("698", "IMPOTS_BENEFICES"),
  certain("699", "IMPOTS_BENEFICES", { note: "Produit (report en arrière des déficits) : vient en diminution de l'impôt." }),
  // 70 — Ventes
  review("70", "PRODUCTION_VENDUE", "Compte 70 non subdivisé : ventes de marchandises (707) ou production vendue ?"),
  certain("701", "PRODUCTION_VENDUE"),
  certain("702", "PRODUCTION_VENDUE"),
  certain("703", "PRODUCTION_VENDUE"),
  certain("704", "PRODUCTION_VENDUE"),
  certain("705", "PRODUCTION_VENDUE"),
  certain("706", "PRODUCTION_VENDUE"),
  certain("707", "VENTES_MARCHANDISES"),
  { ...review("708", "PRODUCTION_VENDUE", "Produits des activités annexes : à rattacher aux ventes de marchandises ou à la production vendue selon l'activité concernée.", { reference: REF_RENVOI }), autoWhen: NO_MERCH },
  review("709", "PRODUCTION_VENDUE", "Rabais accordés non ventilés : sur ventes de marchandises (7097) ou sur production ?"),
  certain("7091", "PRODUCTION_VENDUE"),
  certain("7092", "PRODUCTION_VENDUE"),
  certain("7094", "PRODUCTION_VENDUE"),
  certain("7095", "PRODUCTION_VENDUE"),
  certain("7096", "PRODUCTION_VENDUE"),
  certain("7097", "VENTES_MARCHANDISES"),
  { ...review("7098", "PRODUCTION_VENDUE", "Rabais sur produits des activités annexes : suivent le classement des produits annexes (708) auxquels ils se rapportent.", { reference: REF_RENVOI }), autoWhen: NO_MERCH },
  certain("71", "PRODUCTION_STOCKEE", { note: "Variation des stocks d'en-cours et de produits (713x)." }),
  certain("72", "PRODUCTION_IMMOBILISEE"),
  // 75-78
  certain("75", "AUTRES_PRODUITS"),
  certain("755", "QUOTE_PART_BENEFICE"),
  certain("76", "PRODUITS_FINANCIERS"),
  review("78", null, "Compte 78 non subdivisé : reprise d'exploitation (781), financière (786) ou exceptionnelle (787) ?"),
  certain("781", "REPRISES_EXPLOITATION"),
  certain("786", "PRODUITS_FINANCIERS"),
  certain("787", "PRODUITS_EXCEPTIONNELS"),
];

const PCG_2024_RULES: AccountRule[] = [
  ...COMMON,
  certain("67", "CHARGES_EXCEPTIONNELLES"),
  transitional("672", "CHARGES_EXCEPTIONNELLES", "Charges sur exercices antérieurs : à réimputer par nature."),
  certain("74", "SUBVENTIONS_EXPLOITATION"),
  certain("77", "PRODUITS_EXCEPTIONNELS"),
  transitional("772", "PRODUITS_EXCEPTIONNELS", "Produits sur exercices antérieurs : à réimputer par nature."),
  review("79", null, "Compte 79 non subdivisé : transfert de charges d'exploitation (791), financières (796) ou exceptionnelles (797) ?"),
  convention("791", "REPRISES_EXPLOITATION", "Transferts de charges d'exploitation : présentés avec les reprises, après l'EBE [C-2024-1]."),
  certain("796", "PRODUITS_FINANCIERS"),
  certain("797", "PRODUITS_EXCEPTIONNELS"),
];

const PCG_2025_RULES: AccountRule[] = [
  ...COMMON,
  certain("657", "AUTRES_CHARGES", { reference: REF_PCG25, note: "Valeurs comptables des immobilisations cédées (ex-675) : charge d'exploitation (classe 65), présentée avec les autres charges [C-3]." }),
  certain("658", "AUTRES_CHARGES", { reference: REF_PCG25, note: "Dont pénalités et amendes (6581/6582, ex-6711/6712)." }),
  removed("67", "CHARGES_EXCEPTIONNELLES", "Compte 67 incompatible avec le PCG 2025 (seuls 672, 678 et 687 subsistent) : reclassement par le DAF."),
  transitional("672", "CHARGES_EXCEPTIONNELLES", "Charges sur exercices antérieurs : à réimputer par nature."),
  certain("678", "CHARGES_EXCEPTIONNELLES", { reference: REF_PCG25, note: "Autres charges exceptionnelles : réservées aux événements majeurs et inhabituels (contrôle de nature signalé)." }),
  review("74", "SUBVENTIONS_EXPLOITATION", "Compte 74 non subdivisé : subvention d'exploitation (741), d'équilibre (742) ou quote-part de subvention d'investissement (747) ?"),
  certain("741", "SUBVENTIONS_EXPLOITATION", { reference: REF_PCG25 }),
  review("742", "AUTRES_PRODUITS", "Subvention d'équilibre (ex-7715) : compense un déficit global sans mesurer la performance d'exploitation. Proposition : après l'EBE ; à confirmer pour chaque entreprise [C-1].", { basis: "cabinet", reference: REF_CABINET }),
  convention("747", "AUTRES_PRODUITS", "Quote-part des subventions d'investissement virée au résultat (ex-777) : produit d'exploitation (classe 74) présenté après l'EBE, en regard des dotations aux amortissements [C-2]."),
  certain("757", "AUTRES_PRODUITS", { reference: REF_PCG25, note: "Produits des cessions d'immobilisations (ex-775) : produit d'exploitation (classe 75), présenté avec les autres produits [C-3]." }),
  removed("77", "PRODUITS_EXCEPTIONNELS", "Compte 77 incompatible avec le PCG 2025 (seuls 772, 778 et 787 subsistent) : reclassement par le DAF."),
  transitional("772", "PRODUITS_EXCEPTIONNELS", "Produits sur exercices antérieurs : à réimputer par nature."),
  certain("778", "PRODUITS_EXCEPTIONNELS", { reference: REF_PCG25, note: "Autres produits exceptionnels : réservés aux événements majeurs et inhabituels (contrôle de nature signalé)." }),
  removed("79", null, "Transferts de charges (791, 796, 797) supprimés : les opérations doivent être enregistrées par nature (ex. 649, 7587)."),
];

/** Choix de présentation du cabinet soumis à validation (les règles PCG certaines n'en font pas partie). */
const CHOICES_COMMON = [
  { id: "C-4", text: "708 et 7098 sont rattachés automatiquement à la production vendue uniquement si l'entreprise n'a aucune activité de marchandises sur la période ; sinon le DAF les ventile." },
  { id: "C-5", text: "Propositions par défaut pour les comptes à confirmer : 648 et 649 vers les salaires, 608, 609 et 6098 vers les autres achats ; le DAF peut retenir une autre rubrique, avec justification." },
];

export const RULE_SETS: Record<RuleSetCode, RuleSet> = {
  "PCG-2024": {
    code: "PCG-2024",
    version: 2,
    label: "PCG avant règlement ANC 2022-06 (exercices ouverts avant le 01/01/2025)",
    appliesFrom: null,
    appliesBefore: "2025-01-01",
    lines: LINES("Reprises sur charges et transferts de charges"),
    aggregates: AGGREGATES,
    layout: LAYOUT,
    rules: PCG_2024_RULES,
    hypotheses: [
      ...CHOICES_COMMON,
      { id: "C-2024-1", text: "Les transferts de charges d'exploitation (791) sont présentés avec les reprises, après l'EBE ; 796 en produits financiers ; 797 en produits exceptionnels." },
    ],
  },
  "PCG-2025": {
    code: "PCG-2025",
    version: 2,
    label: "PCG modifié par le règlement ANC 2022-06 (exercices ouverts à compter du 01/01/2025)",
    appliesFrom: "2025-01-01",
    appliesBefore: null,
    lines: LINES("Reprises sur amortissements, dépréciations et provisions"),
    aggregates: AGGREGATES,
    layout: LAYOUT,
    rules: PCG_2025_RULES,
    hypotheses: [
      ...CHOICES_COMMON,
      { id: "C-0", text: "Le tableau des SIG est présenté selon la structure traditionnelle (huit soldes), adaptée au plan de comptes 2025." },
      { id: "C-1", text: "742 Subventions d'équilibre : proposé après l'EBE (autres produits), à confirmer pour chaque entreprise ; le DAF peut le rattacher aux subventions d'exploitation." },
      { id: "C-2", text: "747 Quote-part des subventions d'investissement virée au résultat : présentée après l'EBE (autres produits), et non avec les subventions d'exploitation." },
      { id: "C-3", text: "657 / 757 (cessions d'immobilisations) restent dans le résultat d'exploitation, avec les autres charges et produits, comme le prévoit leur classe ; aucun solde « plus ou moins-values de cession » n'est isolé." },
    ],
  },
};

/** Référentiel applicable selon la date d'ouverture de l'exercice. */
export function ruleSetFor(fiscalYearStart: string): RuleSet {
  return fiscalYearStart >= "2025-01-01" ? RULE_SETS["PCG-2025"] : RULE_SETS["PCG-2024"];
}

export function lineNature(rs: RuleSet, code: LineCode) {
  return rs.lines.find((l) => l.code === code)!.nature;
}

/** Contexte de la période utile aux règles conditionnelles. */
export type ResolutionContext = { merchandiseActivity: boolean };

export const MERCHANDISE_PREFIXES = ["707", "607", "6037", "6097", "7097"];

export type Resolution =
  | { status: "rule"; line: LineCode; rule: AccountRule; autoNote: string | null }
  | { status: "override"; line: LineCode; overrideId: string; justification: string; rule: AccountRule | null }
  | { status: "review" | "transitional" | "removed"; proposal: LineCode | null; rule: AccountRule }
  | { status: "unassigned" };

/** Règle la plus spécifique (préfixe le plus long) pour un compte PCG. */
export function matchRule(rs: RuleSet, pcgAccount: string): AccountRule | null {
  let best: AccountRule | null = null;
  for (const r of rs.rules) {
    if (pcgAccount.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) best = r;
  }
  return best;
}

/** Rubrique SIG d'un compte de classe 6 ou 7 : exception d'entreprise, sinon règle du référentiel. */
export function resolveAccount(
  rs: RuleSet,
  pcgAccount: string,
  override?: { id: string; line: LineCode; justification: string },
  ctx: ResolutionContext = { merchandiseActivity: true },
): Resolution {
  const rule = matchRule(rs, pcgAccount);
  if (override) return { status: "override", line: override.line, overrideId: override.id, justification: override.justification, rule };
  if (!rule) return { status: "unassigned" };
  if (rule.status === "certain" && rule.line) return { status: "rule", line: rule.line, rule, autoNote: null };
  if (rule.status === "review" && rule.line && rule.autoWhen?.condition === "no_merchandise_activity" && !ctx.merchandiseActivity) {
    return { status: "rule", line: rule.line, rule, autoNote: rule.autoWhen.note };
  }
  return { status: rule.status === "certain" ? "review" : rule.status, proposal: rule.line, rule };
}

export const ENGINE_VERSION = "sig-engine@2";
