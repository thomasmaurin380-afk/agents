'use strict';
/**
 * Mesure locale (Node) du temps de traitement d'un FEC fictif volumineux : premier import, publication,
 * puis réimport cumulatif modifié. Donne un ordre de grandeur pour le cœur seul ; ne préjuge pas des
 * temps Apps Script (spikes SP2–SP4).
 *   node scripts/mesure-volume.js [nombre_d_ecritures]
 */
const P = require('../src/app/pipeline');
const { hasher, CLIENT, PROFIL_FEC, NOM_FEC, prng, fec, ecrituresAleatoires, cloner, choixComplets } = require('../test/aides');

const n = Number(process.argv[2] || 20000);
const perimetre = { exercice_id: '2026', du: '2026-01-01', au: '2026-03-31' };
const alea = prng(12345);
const base = ecrituresAleatoires(alea, n);
const lignes = base.reduce((s, e) => s + e.lignes.length, 0);

function chrono(libelle, f) {
  const t0 = process.hrtime.bigint();
  const r = f();
  console.log(`${libelle.padEnd(38)} ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(0).padStart(7)} ms`);
  return r;
}

console.log(`FEC fictif : ${n} écritures, ${lignes} lignes`);
let etat = P.etatInitial(CLIENT.client_id);
const texte1 = fec(base);
const a1 = chrono('Analyse import 1 (base vide)', () => P.analyserImport({ etat, fichier: { texte: texte1, nomFichier: NOM_FEC, sha256: 's1' },
  profil: PROFIL_FEC, client: CLIENT, perimetre, import_id: 'I1', hasher }));
etat = chrono('Validation + publication 1', () => P.publier(etat, a1, P.valider(etat, a1, choixComplets(a1), hasher), 'PUB-1', hasher)).etat;

const modifie = cloner(base);
for (let i = 0; i < modifie.length; i += 50) { modifie[i].lignes[0].d += 100; modifie[i].lignes[modifie[i].lignes.length - 1].c += 100; }
modifie.splice(0, 10);
const texte2 = fec(modifie);
const a2 = chrono('Analyse import 2 (cumulatif modifié)', () => P.analyserImport({ etat, fichier: { texte: texte2, nomFichier: NOM_FEC, sha256: 's2' },
  profil: PROFIL_FEC, client: CLIENT, perimetre, import_id: 'I2', hasher }));
console.log('  statuts :', JSON.stringify(a2.comparaison.compteurs));
const r2 = chrono('Validation + publication 2', () => P.publier(etat, a2, P.valider(etat, a2, choixComplets(a2), hasher), 'PUB-2', hasher));
chrono('Annulation publication 2', () => P.annulerDernierePublication(r2.etat, 'ANN-1', hasher));
