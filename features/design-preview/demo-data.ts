/**
 * DONNÉES FICTIVES — uniquement pour la maquette de conception (/daf/maquette, activée par
 * DESIGN_PREVIEW=1). Aucune de ces valeurs ne provient d'une entreprise ni d'un calcul ; elles ne
 * doivent jamais être utilisées dans une page opérationnelle.
 */
export const DEMO_PERIOD = "Janv. 2026 – Juin 2026";

export const DEMO_KPIS = {
  ca: { value: 928_410, delta: "+12,8 %", diff: "+105 320 €" },
  tresorerie: { value: 406_270, delta: "+8,2 %", diff: "+30 870 €" },
  resultat: { value: 168_930, delta: "−3,4 %", diff: "−5 920 €" },
  dossiers: { value: 24, delta: "+4", total: 28 },
};

export const DEMO_MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin"];
export const DEMO_MONTHS_FULL = ["Janvier 2026", "Février 2026", "Mars 2026", "Avril 2026", "Mai 2026", "Juin 2026"];
export const DEMO_CA = [286_400, 331_900, 233_200, 226_800, 342_120, 258_700];
export const DEMO_RESULTAT = [118_300, 126_400, 92_100, 121_900, 142_600, 139_500];

export const DEMO_SIZES = [
  { label: "TPE", value: 11 },
  { label: "PME", value: 9 },
  { label: "ETI", value: 5 },
  { label: "Grands comptes", value: 3 },
];

export const DEMO_ACTIVITY = [
  { date: "12 juin 2026", icon: "file", item: "Facture importée", client: "Atelier Dupont", amount: "12 450,00 €", status: "Traité", user: "Camille Durand" },
  { date: "11 juin 2026", icon: "upload", item: "Écritures comptables", client: "Nova Conseil", amount: null, status: "À valider", user: "Thomas Moreau" },
  { date: "10 juin 2026", icon: "chart", item: "Budget 2026 mis à jour", client: "Groupe Beltrame", amount: null, status: "Publié", user: "Julie Martin" },
  { date: "8 juin 2026", icon: "file", item: "Note de frais approuvée", client: "Atelier Dupont", amount: "320,00 €", status: "Validé", user: "Camille Durand" },
  { date: "6 juin 2026", icon: "download", item: "Relevé bancaire importé", client: "Société Keller", amount: null, status: "Traité", user: "Marc Lefèvre" },
] as const;
