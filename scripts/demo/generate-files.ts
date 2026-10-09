// Génère des fichiers de démonstration FICTIFS et cohérents entre eux pour « Atelier Numérique »
// (société de services, exercice 2025) : FEC, balance au 31/12/2025 (dérivée du FEC) et relevé
// bancaire (dérivé du compte 512). Déterministe : relancer produit les mêmes fichiers.
// Usage : npx tsx scripts/demo/generate-files.ts
import { mkdirSync, writeFileSync } from "node:fs";
import writeXlsxFile from "write-excel-file/node";

type Line = { journal: string; jlib: string; num: string; date: string; account: string; alib: string; piece: string; label: string; debit: number; credit: number };

const OUT = "demo-files";
const lines: Line[] = [];
let entry = 0;
const ACC: Record<string, string> = {
  "101000": "Capital social", "164000": "Emprunts auprès des établissements de crédit", "401000": "Fournisseurs",
  "411000": "Clients", "421000": "Personnel - rémunérations dues", "431000": "Sécurité sociale",
  "445510": "TVA à décaisser", "445660": "TVA déductible sur ABS", "445710": "TVA collectée", "512000": "Banque Démo", "604000": "Achats de prestations de services",
  "606400": "Fournitures administratives", "613200": "Locations immobilières", "616000": "Primes d'assurance",
  "626000": "Frais postaux et de télécommunications", "627000": "Services bancaires", "641100": "Salaires, appointements",
  "645100": "Cotisations URSSAF", "661100": "Intérêts des emprunts", "706000": "Prestations de services",
};

const cents = (n: number) => Math.round(n * 100);
function post(journal: string, jlib: string, date: string, piece: string, label: string, legs: [string, number, number][]) {
  entry++;
  const d = legs.reduce((s, l) => s + cents(l[1]), 0);
  const c = legs.reduce((s, l) => s + cents(l[2]), 0);
  if (d !== c) throw new Error(`Écriture ${entry} déséquilibrée`);
  for (const [account, debit, credit] of legs) {
    lines.push({ journal, jlib, num: `${journal}${String(entry).padStart(5, "0")}`, date, account, alib: ACC[account], piece, label, debit, credit });
  }
}
const day = (m: number, d: number) => `2025${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

// À-nouveaux : capital et emprunt, trésorerie d'ouverture.
post("AN", "A-nouveaux", day(1, 1), "AN2025", "Reprise des soldes", [["512000", 25000, 0], ["101000", 0, 10000], ["164000", 0, 15000]]);

const clients = ["Société Alpha", "Bêta Industrie", "Cabinet Gamma"];
let vatDue = 0;
for (let m = 1; m <= 12; m++) {
  // Paiement de la TVA du mois précédent (déclaration CA3 mensuelle).
  if (vatDue > 0) post("BQ", "Banque", day(m, 19), `CA3-${m - 1}`, "PRLV DGFIP TVA", [["445510", vatDue, 0], ["512000", 0, vatDue]]);
  const vatStart = lines.length;
  const season = 1 + 0.15 * Math.sin((m / 12) * 2 * Math.PI);
  clients.forEach((client, i) => {
    const ht = r2((4200 + i * 1350) * season);
    const tva = r2(ht * 0.2);
    const ttc = r2(ht + tva);
    const piece = `FA${m}${i + 1}`;
    post("VT", "Ventes", day(m, 5 + i * 7), piece, `Facture ${client}`, [["411000", ttc, 0], ["706000", 0, ht], ["445710", 0, tva]]);
    // Encaissement le mois suivant (les factures de décembre restent à encaisser).
    if (m < 12) post("BQ", "Banque", day(m + 1, 8 + i * 6), piece, `VIR ${client.toUpperCase()}`, [["512000", ttc, 0], ["411000", 0, ttc]]);
  });
  const sub = r2(1800 * season);
  post("AC", "Achats", day(m, 10), `FF${m}`, "Sous-traitance développement", [["604000", sub, 0], ["445660", r2(sub * 0.2), 0], ["401000", 0, r2(sub * 1.2)]]);
  post("BQ", "Banque", day(m, 28), `FF${m}`, "VIR SOUS-TRAITANT DEV", [["401000", r2(sub * 1.2), 0], ["512000", 0, r2(sub * 1.2)]]);
  post("BQ", "Banque", day(m, 3), `LOY${m}`, "PRLV LOYER BUREAUX", [["613200", 1100, 0], ["445660", 220, 0], ["512000", 0, 1320]]);
  post("BQ", "Banque", day(m, 12), `TEL${m}`, "PRLV OPERATEUR TELECOM", [["626000", 95, 0], ["445660", 19, 0], ["512000", 0, 114]]);
  if (m % 3 === 0) post("BQ", "Banque", day(m, 15), `FOU${m}`, "CB FOURNITURES BUREAU", [["606400", 140, 0], ["445660", 28, 0], ["512000", 0, 168]]);
  post("OD", "Opérations diverses", day(m, 30 - (m === 2 ? 2 : 0)), `SAL${m}`, "Salaires du mois", [["641100", 5200, 0], ["645100", 2250, 0], ["421000", 0, 4050], ["431000", 0, 3400]]);
  post("BQ", "Banque", day(m, 27 - (m === 2 ? 1 : 0)), `SAL${m}`, "VIR SALAIRES", [["421000", 4050, 0], ["512000", 0, 4050]]);
  post("BQ", "Banque", day(m, 15), `URS${m}`, "PRLV URSSAF", [["431000", 3400, 0], ["512000", 0, 3400]]);
  post("BQ", "Banque", day(m, 20), `PRT${m}`, "ECHEANCE PRET", [["164000", 1180, 0], ["661100", 45, 0], ["512000", 0, 1225]]);
  post("BQ", "Banque", day(m, 25), `FRA${m}`, "FRAIS BANCAIRES", [["627000", 18.5, 0], ["512000", 0, 18.5]]);
  if (m === 4) post("BQ", "Banque", day(m, 18), "ASS2025", "PRLV ASSURANCE RC PRO", [["616000", 980, 0], ["512000", 0, 980]]);
  // Déclaration de TVA du mois : collectée − déductible = TVA à décaisser.
  const monthLines = lines.slice(vatStart);
  const collected = r2(monthLines.filter((l) => l.account === "445710").reduce((t, l) => t + l.credit, 0));
  const deductible = r2(monthLines.filter((l) => l.account === "445660").reduce((t, l) => t + l.debit, 0));
  vatDue = r2(collected - deductible);
  post("OD", "Opérations diverses", day(m, 28), `CA3-${m}`, "Déclaration de TVA", [["445710", collected, 0], ["445660", 0, deductible], ["445510", 0, vatDue]]);
}

const fr = (n: number) => (n === 0 ? "0,00" : n.toFixed(2).replace(".", ","));
mkdirSync(OUT, { recursive: true });

// 1) FEC (tabulation, UTF-8).
const FEC_HEAD = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
writeFileSync(
  `${OUT}/atelier-numerique-FEC-2025.txt`,
  [FEC_HEAD, ...lines.map((l) => [l.journal, l.jlib, l.num, l.date, l.account, l.alib, "", "", l.piece, l.date, l.label, fr(l.debit), fr(l.credit), "", "", "20260115", "", ""].join("\t"))].join("\r\n") + "\r\n",
);

// 2) Balance au 31/12/2025, dérivée du FEC (Windows-1252, « ; », titres, décimales françaises).
const byAcc = new Map<string, { d: number; c: number }>();
for (const l of lines) {
  const a = byAcc.get(l.account) ?? { d: 0, c: 0 };
  a.d += cents(l.debit);
  a.c += cents(l.credit);
  byAcc.set(l.account, a);
}
const tbRows = [...byAcc].sort(([a], [b]) => a.localeCompare(b)).map(([acc, { d, c }]) => {
  const s = d - c;
  return [acc, ACC[acc], fr(d / 100), fr(c / 100), s > 0 ? fr(s / 100) : "", s < 0 ? fr(-s / 100) : ""].join(";");
});
const tot = [...byAcc.values()].reduce<{ d: number; c: number; sd: number; sc: number }>((t, v) => ({ d: t.d + v.d, c: t.c + v.c, sd: t.sd + Math.max(0, v.d - v.c), sc: t.sc + Math.max(0, v.c - v.d) }), { d: 0, c: 0, sd: 0, sc: 0 });
const tbText = [
  "Atelier Numérique Conseil SAS (démo) - Balance générale",
  "Période du 01/01/2025 au 31/12/2025",
  "",
  "Compte;Intitulé;Mouvements débit;Mouvements crédit;Solde débit;Solde crédit",
  ...tbRows,
  ["Total général", "", fr(tot.d / 100), fr(tot.c / 100), fr(tot.sd / 100), fr(tot.sc / 100)].join(";"),
].join("\r\n");
writeFileSync(`${OUT}/atelier-numerique-balance-2025-12-31.csv`, Buffer.from(tbText, "latin1"));

// 3) Relevé bancaire 2025 dérivé du compte 512 (hors à-nouveau), avec solde après opération.
const bank = lines.filter((l) => l.account === "512000" && l.journal !== "AN").sort((a, b) => a.date.localeCompare(b.date) || a.num.localeCompare(b.num));
let balance = cents(25000);
const bankRows = bank.map((l) => {
  balance += cents(l.debit) - cents(l.credit);
  const d = `${l.date.slice(6, 8)}/${l.date.slice(4, 6)}/${l.date.slice(0, 4)}`;
  return { d, label: l.label, out: l.credit, inn: l.debit, bal: balance / 100 };
});
writeFileSync(
  `${OUT}/atelier-numerique-releve-2025.csv`,
  ["Date;Libellé;Débit;Crédit;Solde", ...bankRows.map((r) => [r.d, r.label, r.out ? fr(r.out) : "", r.inn ? fr(r.inn) : "", fr(r.bal)].join(";"))].join("\n") + "\n",
);

// 4) Même relevé au format XLSX (premier semestre), montant signé.
await writeXlsxFile(
  [
    [{ value: "Date opération" }, { value: "Libellé" }, { value: "Montant" }],
    ...bankRows.filter((r) => Number(r.d.slice(3, 5)) <= 6).map((r) => [
      { type: Date, value: new Date(Date.UTC(Number(r.d.slice(6, 10)), Number(r.d.slice(3, 5)) - 1, Number(r.d.slice(0, 2)))), format: "dd/mm/yyyy" },
      { type: String, value: r.label },
      { type: Number, value: r.inn ? r.inn : -r.out },
    ]),
  ],
).toFile(`${OUT}/atelier-numerique-releve-S1-2025.xlsx`);

console.log(`${lines.length} lignes FEC, ${entry} écritures, ${byAcc.size} comptes, ${bankRows.length} opérations bancaires ; solde final ${fr(balance / 100)} €`);
