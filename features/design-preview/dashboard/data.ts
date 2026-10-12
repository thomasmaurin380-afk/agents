/**
 * DONNÉES FICTIVES : elles servent uniquement à la maquette de conception (/daf/maquette, activée
 * par DESIGN_PREVIEW=1). Aucune valeur ne provient d'une entreprise réelle ni d'un calcul de
 * l'application. Elles ne doivent jamais alimenter une page opérationnelle.
 *
 * C'est le jeu unique de la maquette : les deux modes d'interface le lisent à travers le même
 * modèle (model.ts). Ce qui est dérivable n'est jamais saisi : capitaux propres, ratios,
 * variations, parts et totaux sont calculés.
 * Montants en euros, sous forme de chaînes décimales (aucun flottant).
 */

export const DEMO_GROUP = "Groupe fictif";
export const DEMO_FISCAL_YEAR = 2024;

export const DEMO_MONTHS_SHORT = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
export const DEMO_MONTHS_LONG = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export type BalanceLine = { key: string; label: string; n: string; n1: string; group: string };

/** Bilan consolidé fictif au 31/12/2024 (n) et au 31/12/2023 (n1). */
export const DEMO_BALANCE: { actifs: BalanceLine[]; passifs: BalanceLine[]; capitaux: BalanceLine[] } = {
  actifs: [
    { key: "immo-incorp", label: "Immobilisations incorporelles", n: "214830", n1: "198400", group: "immobilise" },
    { key: "immo-corp", label: "Immobilisations corporelles", n: "1268415", n1: "1205260", group: "immobilise" },
    { key: "immo-fin", label: "Immobilisations financières", n: "208328", n1: "196900", group: "immobilise" },
    { key: "stocks", label: "Stocks et en-cours", n: "979332", n1: "912750", group: "stocks" },
    { key: "clients", label: "Créances clients", n: "312690", n1: "288140", group: "creances" },
    { key: "autres-creances", label: "Autres créances", n: "488581", n1: "452300", group: "creances" },
    { key: "tresorerie", label: "Trésorerie", n: "523410", n1: "441980", group: "tresorerie" },
    { key: "autres-actifs", label: "Charges constatées d'avance et divers", n: "455922", n1: "401670", group: "autres" },
  ],
  passifs: [
    { key: "provisions", label: "Provisions pour risques et charges", n: "96420", n1: "88300", group: "provisions" },
    { key: "emprunts", label: "Emprunts et dettes financières", n: "1284760", n1: "1342900", group: "financier" },
    { key: "fournisseurs", label: "Dettes fournisseurs", n: "228450", n1: "251380", group: "exploitation" },
    { key: "fiscales-sociales", label: "Dettes fiscales et sociales", n: "512318", n1: "476210", group: "exploitation" },
    { key: "autres-dettes", label: "Autres dettes", n: "329600", n1: "301150", group: "exploitation" },
  ],
  capitaux: [
    { key: "capital", label: "Capital social", n: "975960", n1: "800000", group: "capitaux" },
    { key: "reserves", label: "Primes et réserves", n: "760300", n1: "725300", group: "capitaux" },
    { key: "ran", label: "Report à nouveau", n: "77160", n1: "-30140", group: "capitaux" },
    { key: "resultat", label: "Résultat de l'exercice", n: "186540", n1: "142300", group: "capitaux" },
  ],
};

/** Regroupements de l'actif pour l'anneau de répartition. */
export const DEMO_ASSET_GROUPS = [
  { key: "immobilise", label: "Actifs immobilisés" },
  { key: "stocks", label: "Stocks" },
  { key: "creances", label: "Créances (clients et autres)" },
  { key: "tresorerie", label: "Trésorerie" },
  { key: "autres", label: "Autres actifs" },
] as const;

/**
 * Total de l'actif et des dettes (hors capitaux propres) en fin de mois, janvier à décembre 2024.
 * Décembre est égal au bilan ci-dessus (vérifié par les tests).
 */
export const DEMO_MONTHLY_BALANCE = {
  actifs: ["4128400", "4156900", "4183200", "4205700", "4231900", "4262400", "4279600", "4301200", "4322800", "4341500", "4362300", "4451508"],
  passifs: ["2462100", "2455800", "2449300", "2441700", "2436900", "2431200", "2425400", "2419800", "2414600", "2410300", "2418900", "2451548"],
};

/**
 * Comptes sociaux fictifs des entités du groupe, avant éliminations de consolidation. Leur somme
 * n'est pas le bilan consolidé et n'est jamais présentée comme tel. `prev*` : fin du mois précédent.
 */
export const DEMO_ENTITIES = [
  { id: "holding", name: "Holding", actifs: "1412300", passifs: "386200", prevActifs: "1398600", prevPassifs: "391400", fondsRoulement: "286400", liquidite: "2.41" },
  { id: "france", name: "France SAS", actifs: "2186400", passifs: "1402900", prevActifs: "2141800", prevPassifs: "1386200", fondsRoulement: "412700", liquidite: "1.38" },
  { id: "belgique", name: "Filiale Belgique", actifs: "612800", passifs: "398700", prevActifs: "604100", prevPassifs: "401900", fondsRoulement: "118300", liquidite: "1.52" },
  { id: "espagne", name: "Filiale Espagne", actifs: "498100", passifs: "361300", prevActifs: "489700", prevPassifs: "352800", fondsRoulement: "64900", liquidite: "1.17" },
] as const;

export type DemoEntityId = (typeof DEMO_ENTITIES)[number]["id"];

/** Activité consolidée fictive de l'exercice 2024, mois par mois. */
export const DEMO_ACTIVITY = {
  chiffreAffaires: ["92400", "88150", "101300", "97860", "106420", "112380", "98640", "87210", "109870", "118450", "116290", "119350"],
  resultatNet: ["12840", "11260", "16120", "14380", "17950", "19210", "13870", "9640", "17380", "20120", "19633", "14137"],
  /** Exercice précédent (totaux annuels). */
  previousYear: { chiffreAffaires: "1108400", resultatNet: "142300", chargesExploitation: "924800" },
  chargesExploitation: [
    { key: "rh", label: "Ressources humaines", amount: "387095" },
    { key: "achats", label: "Achats et sous-traitance", amount: "264854" },
    { key: "frais-generaux", label: "Frais généraux", amount: "183361" },
    { key: "impots", label: "Impôts et taxes", amount: "122240" },
    { key: "autres", label: "Autres charges", amount: "61120" },
  ],
};

/** Trésorerie disponible en fin de mois, juillet à décembre 2024 (décembre = bilan). */
export const DEMO_TREASURY_MONTHS = { firstMonth: 7, values: ["398200", "421600", "437900", "466300", "452780", "523410"] };

/** Objectif annuel de résultat net : valeur fictive de maquette (aucun budget réel). */
export const DEMO_RESULT_TARGET = "250000";

export const DEMO_OPERATIONS = [
  { id: "op1", date: "18 déc. 2024", label: "Encaissement client, facture F-2024-1182", category: "Ventes", amount: "24600", status: "Rapprochée" },
  { id: "op2", date: "17 déc. 2024", label: "Règlement fournisseur, matières premières", category: "Achats et sous-traitance", amount: "-8940", status: "Rapprochée" },
  { id: "op3", date: "16 déc. 2024", label: "Salaires de décembre", category: "Ressources humaines", amount: "-62380", status: "Validée" },
  { id: "op4", date: "13 déc. 2024", label: "TVA de novembre", category: "Impôts et taxes", amount: "-14205", status: "À valider" },
  { id: "op5", date: "12 déc. 2024", label: "Encaissement client, facture F-2024-1169", category: "Ventes", amount: "11760", status: "Rapprochée" },
] as const;
