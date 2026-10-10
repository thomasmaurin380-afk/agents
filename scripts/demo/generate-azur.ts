// Reconstitution FICTIVE et déterministe du jeu « AZUR CONSEIL SA » (exercice 2025) décrit dans le
// cahier de recette de la Phase 3 : les fichiers originaux n'étant pas disponibles dans le dépôt,
// ces fichiers en reproduisent les caractéristiques publiées (balance 8 comptes, totaux 32 048,80 ;
// FEC 46 écritures, 116 lignes, 60 931,60 ; relevé 21 opérations, solde net +10 983,60).
// Usage : npx tsx scripts/demo/generate-azur.ts
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "demo-files/azur-conseil";
const fr = (c: number) => `${Math.trunc(c / 100)},${String(c % 100).padStart(2, "0")}`;
const LABELS: Record<string, string> = {
  "101000": "Capital social", "401000": "Fournisseurs", "411000": "Clients", "445660": "TVA déductible sur ABS",
  "445710": "TVA collectée", "512000": "Banque", "615000": "Entretien et réparations", "706000": "Prestations de services",
};

type Leg = [account: string, debit: number, credit: number];
const fec: string[] = [
  "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise",
];
const bank: { date: string; label: string; amount: number }[] = [];
let n = 0;
const ymd = (m: number, d: number) => `2025${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
function post(journal: string, jlib: string, date: string, piece: string, label: string, legs: Leg[]) {
  n++;
  const d = legs.reduce((s, l) => s + l[1], 0);
  const c = legs.reduce((s, l) => s + l[2], 0);
  if (d !== c) throw new Error(`Écriture ${n} déséquilibrée`);
  for (const [acc, debit, credit] of legs) {
    fec.push([journal, jlib, `${journal}${String(n).padStart(4, "0")}`, date, acc, LABELS[acc], "", "", piece, date, label, fr(debit), fr(credit), "", "", "20260115", "", ""].join("\t"));
  }
  const b = legs.find((l) => l[0] === "512000");
  if (b && journal === "BQ") bank.push({ date, label, amount: b[1] - b[2] });
}

post("AN", "A-nouveaux", ymd(1, 1), "AN2025", "Apport en capital", [["512000", 1_000_000, 0], ["101000", 0, 1_000_000]]);
for (let m = 1; m <= 12; m++) {
  post("VT", "Ventes", ymd(m, 5), `FA25-${m}`, `Mission de conseil ${m}/2025`, [["411000", 178_500, 0], ["706000", 0, 148_750], ["445710", 0, 29_750]]);
  post("AC", "Achats", ymd(m, 10), `FF25-${m}`, `Maintenance ${m}/2025`, [["615000", 45_800, 0], ["445660", 9_160, 0], ["401000", 0, 54_960]]);
}
for (let m = 2; m <= 11; m++) {
  const amount = m === 11 ? 88_500 : 178_500; // 9 × 1 785,00 + 885,00 = 16 950,00
  post("BQ", "Banque", ymd(m, 15), `ENC-${m}`, `VIR CLIENT FA25-${m - 1}`, [["512000", amount, 0], ["411000", 0, amount]]);
}
for (let m = 2; m <= 12; m++) {
  const amount = m === 12 ? 47_040 : 54_960; // 10 × 549,60 + 470,40 = 5 966,40
  post("BQ", "Banque", ymd(m, 20), `DEC-${m}`, `VIR FOURNISSEUR FF25-${m - 1}`, [["401000", amount, 0], ["512000", 0, amount]]);
}

const balance = [
  "Compte;Intitulé;Solde débit;Solde crédit",
  "101000;Capital social;;10 000,00", "401000;Fournisseurs;;628,80", "445710;TVA collectée;;3 570,00",
  "706000;Prestations de services;;17 850,00", "512000;Banque;20 983,60;", "411000;Clients;4 470,00;",
  "615000;Entretien et réparations;5 496,00;", "445660;TVA déductible sur ABS;1 099,20;",
];
const releve = ["Date;Libellé;Montant", ...bank.map((b) => `${b.date.slice(6)}/${b.date.slice(4, 6)}/2025;${b.label};${b.amount < 0 ? "-" : ""}${fr(Math.abs(b.amount))}`)];

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/01_FEC_2025_valide.txt`, fec.join("\r\n") + "\r\n");
writeFileSync(`${OUT}/02_BALANCE_2025_valide.csv`, balance.join("\r\n") + "\r\n");
writeFileSync(`${OUT}/03_BANQUE_2025_valide.csv`, releve.join("\r\n") + "\r\n");
console.log(`${n} écritures, ${fec.length - 1} lignes FEC, ${bank.length} opérations bancaires`);
