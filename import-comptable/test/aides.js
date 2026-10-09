'use strict';
/**
 * Aides de test : client et profil de référence en ligne (indépendants des jeux de l'ingénieur),
 * générateur pseudo-aléatoire à graine fixe, construction de FEC synthétiques.
 */

const hasher = require('../src/adapters/node/hasher');

const CLIENT = Object.freeze({
  client_id: 'CLI-UNIT',
  siren: '999999999',
  longueur_compte: 8,
  exercices: [
    { id: '2025', debut: '2025-01-01', fin: '2025-12-31', statut: 'CLOTURE' },
    { id: '2026', debut: '2026-01-01', fin: '2026-12-31', statut: 'OUVERT' }
  ],
  seuils: { suppr_masse_pct: 5, suppr_masse_nb: 50 }
});

const ENTETE_FEC = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
  'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
  'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
const CHAMPS = ['journal_code', 'journal_lib', 'ecriture_num', 'ecriture_date', 'compte_num', 'compte_lib',
  'comp_aux_num', 'comp_aux_lib', 'piece_ref', 'piece_date', 'ecriture_lib', 'debit', 'credit',
  'ecriture_let', 'date_let', 'valid_date', 'montant_devise', 'idevise'];

const PROFIL_FEC = Object.freeze({
  profil_id: 'FEC_UNIT', version: 1, type: 'FEC', encodage: 'UTF-8', separateur: '\t', decimal: ',',
  format_date: 'AAAAMMJJ', mode_sens: 'DEBIT_CREDIT',
  colonnes: Object.fromEntries(ENTETE_FEC.map((h, i) => [h, CHAMPS[i]])),
  colonnes_ignorees: [], valeurs_sens: { D: ['D'], C: ['C'] }, lettrage_vide: ['', '0'],
  portee_numerotation: 'EXERCICE', contiguite_ecritures: true
});

const PERIMETRE_T1 = Object.freeze({ exercice_id: '2026', du: '2026-01-01', au: '2026-03-31' });
const NOM_FEC = '999999999FEC20261231.txt';

/** Générateur mulberry32 : déterministe pour une graine donnée. */
function prng(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function montantTexte(cts) {
  if (!cts) return '';
  return Math.floor(cts / 100) + ',' + String(cts % 100).padStart(2, '0');
}

/**
 * Écriture : {journal, num, date (AAAAMMJJ), lignes: [{compte, aux?, lib?, d, c, let?}], valid?}
 */
function ligneFec(e, l) {
  return [e.journal, 'Journal ' + e.journal, e.num, e.date, l.compte, 'Compte ' + l.compte,
    l.aux || '', l.aux ? 'Tiers ' + l.aux : '', e.piece || 'P' + e.num, e.pieceDate || e.date, l.lib || e.lib || 'Écriture ' + e.num,
    montantTexte(l.d), montantTexte(l.c), l.let || '', l.let ? e.date : '', e.valid || '', '', ''].join('\t');
}

function fec(ecritures, options) {
  const fin = (options && options.crlf) ? '\r\n' : '\n';
  const lignes = [ENTETE_FEC.join('\t')];
  ecritures.forEach((e) => e.lignes.forEach((l) => lignes.push(ligneFec(e, l))));
  return lignes.join(fin) + fin;
}

const COMPTES = ['401', '411', '512', '606100', '607', '613200', '6226', '706', '44566', '44571'];

/** Génère n écritures équilibrées aléatoires datées dans le premier trimestre 2026. */
function ecrituresAleatoires(alea, n, prefixe) {
  const ecritures = [];
  for (let i = 1; i <= n; i++) {
    const nb = 2 + Math.floor(alea() * 3);
    const lignes = [];
    let total = 0;
    for (let k = 0; k < nb - 1; k++) {
      const cts = 1 + Math.floor(alea() * 500000);
      total += cts;
      lignes.push({ compte: COMPTES[Math.floor(alea() * COMPTES.length)], d: cts, c: 0 });
    }
    lignes.push({ compte: COMPTES[Math.floor(alea() * COMPTES.length)], d: 0, c: total, aux: alea() < 0.3 ? '0012' : '' });
    const mois = 1 + Math.floor(alea() * 3);
    const jour = 1 + Math.floor(alea() * 28);
    ecritures.push({
      journal: ['AC', 'VT', 'BQ', 'OD'][Math.floor(alea() * 4)],
      num: (prefixe || '') + String(i).padStart(6, '0'),
      date: '2026' + String(mois).padStart(2, '0') + String(jour).padStart(2, '0'),
      valid: alea() < 0.8 ? '20260401' : '',
      lignes
    });
  }
  return ecritures;
}

function melanger(alea, tableau) {
  const t = tableau.slice();
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

function cloner(v) { return JSON.parse(JSON.stringify(v)); }

const CHECKLIST_OK = Object.freeze({ fichier_plus_recent: true, variations_expliquees: true, decisions_revues: true });
const MOTIF_TEST = 'Dérogation de test motivée par le scénario';
const HORO = { soumis: '2026-10-09T10:00:00Z', valide: '2026-10-09T11:00:00Z' };

/** Identité confirmée par le dossier de dépôt (ce que l'adaptateur Drive fournira). */
function identite(client) { return { dossier_client_id: (client || CLIENT).client_id }; }

/**
 * Choix de validation « tout traité » (décisions typées) : dérogation motivée pour chaque B (hors IDN_ABSENTE),
 * acquittement de chaque A (par code), décision pour chaque ABSENTE (par défaut ACCEPTER, motivée), check-list complète.
 * @param {Object<string, string>} [absentes] cle → ACCEPTER | REPORTER
 */
function choixComplets(analyse, absentes, options) {
  const o = options || {};
  const decisions = [];
  (analyse.comparaison ? analyse.comparaison.ecritures : []).forEach((e) => {
    if (e.statut !== 'ABSENTE') return;
    decisions.push({ decision_id: 'ABS:' + e.cle, type: 'ABSENTE', import_id: analyse.import_id, cle: e.cle,
      choix: (absentes && absentes[e.cle]) || 'ACCEPTER', motif: o.motifAbsente === undefined ? MOTIF_TEST : o.motifAbsente, par: 'TEST', le: HORO.valide });
  });
  analyse.anomalies.filter((a) => a.gravite === 'B' && a.code !== 'IDN_ABSENTE').forEach((a) => {
    decisions.push({ decision_id: 'DER:' + a.anomalie_id, type: 'DEROGATION', import_id: analyse.import_id, anomalie_id: a.anomalie_id,
      empreinte_derogation: a.empreinte_derogation, motif: MOTIF_TEST, reference: '', par: 'TEST', le: HORO.valide,
      origine: 'MANUELLE', source_decision_id: '' });
  });
  const parCode = {};
  analyse.anomalies.filter((a) => a.gravite === 'A' && a.code !== 'IDN_ABSENTE').forEach((a) => { (parCode[a.code] = parCode[a.code] || []).push(a.anomalie_id); });
  Object.keys(parCode).sort().forEach((code) => {
    decisions.push({ decision_id: 'ACQ:' + code, type: 'ACQUITTEMENT', import_id: analyse.import_id, code, anomalie_ids: parCode[code],
      commentaire: 'Revu en test', par: 'TEST', le: HORO.valide });
  });
  return { decisions, checklist: CHECKLIST_OK, validation_id: 'VAL-' + analyse.import_id,
    soumis_par: 'TEST', soumis_le: HORO.soumis, valide_par: 'TEST', valide_le: HORO.valide };
}

/** Valide « tout traité » puis publie ; échoue le test si la publication est refusée. */
function publierTout(P, etat, analyse, publicationId, absentes) {
  const validee = P.valider(etat, analyse, choixComplets(analyse, absentes), hasher);
  const r = P.publier(etat, analyse, validee, { publication_id: publicationId, horodatage: HORO.valide }, hasher);
  if (!r.ok) throw new Error('publication refusée : ' + r.refus.join(', ') + ' ' + JSON.stringify(r.details));
  return r.etat;
}

/** Variations [{compte, delta_cts}] → {compte: delta}. */
function variationsEnTable(v) { return Object.fromEntries(v.map((x) => [x.compte, x.delta_cts]).sort()); }

/** Gèle un objet en profondeur (test de non-mutation des entrées). */
function gelerProfond(o, vus = new Set()) {
  if (o && typeof o === 'object' && !vus.has(o)) {
    vus.add(o);
    Object.values(o).forEach((v) => gelerProfond(v, vus));
    Object.freeze(o);
  }
  return o;
}

module.exports = {
  hasher, CLIENT, PROFIL_FEC, PERIMETRE_T1, NOM_FEC, ENTETE_FEC, HORO,
  prng, fec, ecrituresAleatoires, melanger, cloner, montantTexte, identite, choixComplets, publierTout,
  variationsEnTable, gelerProfond, CHECKLIST_OK, MOTIF_TEST
};
