/**
 * Types du moteur SIG. Tous les montants sont des centimes entiers (bigint) : aucun flottant.
 * Convention : `net` = débit − crédit (positif = solde débiteur).
 */
export type RuleSetCode = "PCG-2024" | "PCG-2025";

export type LineCode =
  | "VENTES_MARCHANDISES" | "ACHATS_MARCHANDISES" | "VARIATION_STOCK_MARCHANDISES"
  | "PRODUCTION_VENDUE" | "PRODUCTION_STOCKEE" | "PRODUCTION_IMMOBILISEE"
  | "ACHATS_MATIERES" | "VARIATION_STOCK_MATIERES" | "AUTRES_ACHATS_CHARGES_EXTERNES"
  | "SUBVENTIONS_EXPLOITATION" | "IMPOTS_TAXES" | "SALAIRES_TRAITEMENTS" | "CHARGES_SOCIALES"
  | "REPRISES_EXPLOITATION" | "AUTRES_PRODUITS" | "DOTATIONS_EXPLOITATION" | "AUTRES_CHARGES"
  | "QUOTE_PART_BENEFICE" | "QUOTE_PART_PERTE" | "PRODUITS_FINANCIERS" | "CHARGES_FINANCIERES"
  | "PRODUITS_EXCEPTIONNELS" | "CHARGES_EXCEPTIONNELLES" | "PARTICIPATION" | "IMPOTS_BENEFICES";

export type SubtotalCode = "COUT_ACHAT_MARCHANDISES" | "CONSOMMATIONS_TIERS" | "CHARGES_PERSONNEL" | "CHIFFRE_AFFAIRES";

export type SoldeCode =
  | "MARGE_COMMERCIALE" | "PRODUCTION_EXERCICE" | "VALEUR_AJOUTEE" | "EBE" | "RESULTAT_EXPLOITATION"
  | "RESULTAT_COURANT_AVANT_IMPOTS" | "RESULTAT_EXCEPTIONNEL" | "RESULTAT_NET";

export type RowCode = LineCode | SubtotalCode | SoldeCode;

/** Nature d'une ligne : produit (valeur = crédit − débit) ou charge (valeur = débit − crédit). */
export type Nature = "product" | "charge";

export type LineDef = { code: LineCode; label: string; nature: Nature };

/** Terme d'une formule : référence à une ligne, un sous-total ou un solde, avec son signe. */
export type Term = { ref: RowCode; sign: 1 | -1 };

export type AggregateDef = { code: SubtotalCode | SoldeCode; label: string; terms: Term[]; definition: string; clientExplanation?: string };

/**
 * Règle de rattachement d'un préfixe PCG :
 *  - `certain` : rattachement automatique ;
 *  - `review` : rubrique proposée, intervention du DAF obligatoire (exception d'entreprise) ;
 *  - `transitional` : compte d'attente à réimputer par nature (672/772) : classement par le DAF obligatoire ;
 *  - `removed` : compte incompatible avec ce référentiel ; reclassement obligatoire par le DAF.
 * `basis` distingue une lecture directe du PCG d'une convention de présentation du cabinet.
 */
export type RuleBasis = "pcg" | "cabinet";

/** Condition d'automatisation : la règle `review` devient certaine si la condition est remplie. */
export type AutoCondition = "no_merchandise_activity";

export type AccountRule = {
  prefix: string;
  status: "certain" | "review" | "transitional" | "removed";
  line: LineCode | null;
  basis: RuleBasis;
  reference: string;
  note?: string;
  /** Rattachement automatique à `line` lorsque la condition est vérifiée sur la période. */
  autoWhen?: { condition: AutoCondition; note: string };
};

export type RuleSet = {
  code: RuleSetCode;
  version: number;
  label: string;
  /** Exercices ouverts à compter de / avant cette date (incluse / exclue). */
  appliesFrom: string | null;
  appliesBefore: string | null;
  lines: LineDef[];
  aggregates: AggregateDef[];
  /** Ordre d'affichage du tableau (lignes, sous-totaux, soldes) avec niveau d'indentation. */
  layout: { ref: RowCode; level: 0 | 1 | 2 }[];
  rules: AccountRule[];
  /** Hypothèses de classement soumises à la validation du cabinet avant toute publication. */
  hypotheses: { id: string; text: string }[];
};

/** Solde d'un compte sur la période, issu d'une source comptable. */
export type AccountBalance = {
  account: string;
  label: string;
  pcgAccount: string | null;
  net: bigint;
  debit: bigint | null;
  credit: bigint | null;
  /** Provenance : import, numéros de ligne (balance) ou nombre d'écritures (FEC). */
  origin: {
    importId: string;
    fileName: string | null;
    rows?: number[];
    entries?: number;
    /** Solde mensuel tiré de deux balances : balance soustraite (fin du mois précédent). */
    minus?: { importId: string; fileName: string | null; rows?: number[] };
  };
};

export type Override = { account: string; line: LineCode; justification: string; id: string };

export type Contribution = {
  account: string;
  label: string;
  pcgAccount: string;
  /** Règle appliquée : préfixe PCG, ou exception d'entreprise. */
  via:
    | { kind: "rule"; prefix: string; reference: string; basis: RuleBasis; note: string | null }
    | { kind: "override"; overrideId: string; justification: string };
  /** Montant signé selon la nature de la ligne (produit : crédit − débit ; charge : débit − crédit). */
  amount: bigint;
  debit: bigint | null;
  credit: bigint | null;
  origin: AccountBalance["origin"];
};

export type SigRow = {
  code: RowCode;
  label: string;
  kind: "line" | "subtotal" | "solde";
  level: 0 | 1 | 2;
  value: bigint;
  /** Lignes uniquement : comptes contributeurs (somme = valeur, au centime). */
  contributions: Contribution[];
};

export type CheckSeverity = "blocking" | "warning";

export type SigCheck = {
  code: string;
  severity: CheckSeverity;
  title: string;
  explanation: string;
  accounts?: { account: string; label: string; amount: bigint; detail?: string }[];
  amount?: bigint;
};

export type SourceKind = "trial_balance" | "fec";
