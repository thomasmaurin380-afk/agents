'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/app/pipeline');
const Publication = require('../src/core/publication');
const Anomalies = require('../src/core/anomalies');
const { hasher, CLIENT, PROFIL_FEC, PERIMETRE_T1, NOM_FEC, HORO, fec, cloner, identite, choixComplets, publierTout,
  variationsEnTable, CHECKLIST_OK, MOTIF_TEST } = require('./aides');

const BASE = [
  { journal: 'AC', num: '000045', date: '20260210', valid: '20260301', lignes: [
    { compte: '607', d: 50000 }, { compte: '44566', d: 10000 }, { compte: '401', aux: '0012', c: 60000 }] },
  { journal: 'BQ', num: '000210', date: '20260220', valid: '20260301', lignes: [
    { compte: '512', d: 120000 }, { compte: '411', c: 120000 }] },
  { journal: 'OD', num: '000012', date: '20260228', valid: '20260301', lignes: [
    { compte: '6226', d: 30000 }, { compte: '4081', c: 30000 }] },
  { journal: 'AC', num: 'PROV-17', date: '20260305', valid: '', lignes: [
    { compte: '606100', d: 30000 }, { compte: '401', c: 30000 }] }
];

let compteur = 0;
function analyser(etat, ecritures, extra) {
  compteur++;
  const x = extra || {};
  return P.analyserImport(Object.assign({
    etat, fichier: { texte: fec(ecritures), nomFichier: NOM_FEC, sha256: 'sha-' + compteur },
    profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, identite: identite(x.client), import_id: 'I-' + compteur, hasher
  }, x));
}

function base() {
  const etat = P.etatInitial(CLIENT.client_id);
  const a = analyser(etat, BASE);
  assert.equal(a.rejete, false, JSON.stringify(a.anomalies));
  return publierTout(P, etat, a, 'PUB-1');
}

function statuts(analyse) {
  return Object.fromEntries(analyse.comparaison.ecritures.filter((e) => e.bloc <= 1)
    .map((e) => [e.cle.split('|').slice(2).join('|'), [e.statut, ...e.sous_types].join(' ')]));
}
const codes = (a) => a.anomalies.map((x) => x.code + ':' + x.gravite).sort();

test('Classification : M_FOND, M_LET, ABSENTE, renumérotation repliée en ABSENTE + NOUVELLE', () => {
  const etat = base();
  const f = cloner(BASE);
  f[0].lignes = [{ compte: '607', d: 55000 }, { compte: '44566', d: 11000 }, { compte: '401', aux: '0012', c: 66000 }];
  f[1].lignes[1].let = 'AB';
  f.splice(2, 2, { journal: 'AC', num: '000051', date: '20260305', valid: '20260310', lignes: BASE[3].lignes });
  const a = analyser(etat, f);
  assert.deepEqual(statuts(a), {
    'AC|000045': 'MODIFIEE M_FOND', 'BQ|000210': 'MODIFIEE M_LET',
    'OD|000012': 'ABSENTE', 'AC|PROV-17': 'ABSENTE', 'AC|000051': 'NOUVELLE'
  });
  assert.deepEqual(variationsEnTable(a.variations), { '40100000': -6000, '40810000': 30000, '44566000': 1000, '60700000': 5000, '62260000': -30000 });
  assert.deepEqual(codes(a), ['IDN_ABSENTE:A', 'IDN_ABSENTE:A', 'IDN_MOD_FOND:A', 'IDN_MOD_LET:I', 'VOL_SUPPR_MASSE:B']);
  const prov = a.comparaison.ecritures.find((x) => x.cle.endsWith('PROV-17'));
  assert.equal(prov.aide, 'PROBABLEMENT_VALIDEE_SOUS_NOUVEAU_NUMERO');
  assert.equal(a.anomalies.find((x) => x.code === 'IDN_MOD_FOND').mention, 'VALIDEE');
});

test('Classification : M_DATE et M_DESC distingués du fond ; ordre des lignes indifférent', () => {
  const etat = base();
  const f = cloner(BASE);
  f[0].date = '20260211';
  f[0].pieceDate = '20260210'; // seule la date d'écriture change
  f[1].lignes.reverse();
  f[2].lib = 'Honoraires corrigés';
  const s = statuts(analyser(etat, f));
  assert.equal(s['AC|000045'], 'MODIFIEE M_DATE');
  assert.equal(s['BQ|000210'], 'INCHANGEE');
  assert.equal(s['OD|000012'], 'MODIFIEE M_DESC');
});

test('Doublon intra-fichier : un bloc conservé ; collisions (contenu, dates) bloquantes', () => {
  const etat = P.etatInitial(CLIENT.client_id);
  const vt = { journal: 'VT', num: '000124', date: '20260310', lignes: [{ compte: '411', d: 1000 }, { compte: '706', c: 1000 }] };
  const a = analyser(etat, [vt, BASE[1], cloner(vt)]);
  assert.equal(a.comparaison.compteurs.par_statut.DOUBLON_INTRA, 1);
  assert.equal(a.comparaison.compteurs.lignes_doublons_ignorees, 2);
  assert.equal(a.rejete, false);
  assert.deepEqual(a.comparaison.ecritures.filter((e) => e.cle.endsWith('000124')).map((e) => e.statut + '#' + e.bloc), ['NOUVELLE#1', 'DOUBLON_INTRA#2']);

  const autre = cloner(vt); autre.lignes = [{ compte: '411', d: 2000 }, { compte: '706', c: 2000 }];
  const d1 = { journal: 'OD', num: '9', date: '20260101', lignes: [{ compte: '6226', d: 100 }] };
  const d2 = { journal: 'OD', num: '9', date: '20260102', lignes: [{ compte: '4081', c: 100 }] };
  const b = analyser(etat, [vt, BASE[1], autre, d1, d2]);
  assert.deepEqual(b.comparaison.ecritures.filter((e) => e.statut === 'COLLISION').map((e) => e.motif).sort(), ['BLOCS_DIFFERENTS', 'DATES_MULTIPLES']);
  assert.equal(b.rejete, true);
});

test('Chevauchement : aucune ABSENTE hors du périmètre déclaré', () => {
  const etat = base();
  const a = analyser(etat, [BASE[3]], { perimetre: { exercice_id: '2026', du: '2026-03-01', au: '2026-04-30' } });
  assert.equal(a.comparaison.compteurs.par_statut.ABSENTE, 0);
  assert.equal(statuts(a)['AC|PROV-17'], 'INCHANGEE');
});

test('Publication (T15) : refus cumulés et triés', () => {
  const etat = base();
  const f = cloner(BASE).slice(0, 3);
  f[0].lignes[0].d += 1; // déséquilibre : EQU_ECRITURE (B) + EQU_GLOBAL (BND)
  const a = analyser(etat, f);
  assert.deepEqual(codes(a), ['EQU_ECRITURE:B', 'EQU_GLOBAL:BND', 'IDN_ABSENTE:A', 'IDN_MOD_FOND:A', 'VOL_SUPPR_MASSE:B']);
  const vol = a.anomalies.find((x) => x.code === 'VOL_SUPPR_MASSE');
  const validee = P.valider(etat, a, { decisions: [{ decision_id: 'D1', type: 'DEROGATION', import_id: a.import_id, anomalie_id: vol.anomalie_id,
    empreinte_derogation: vol.empreinte_derogation, motif: 'x'.repeat(19), par: 'TEST', le: HORO.valide, origine: 'MANUELLE' }],
  checklist: {}, validation_id: 'V', soumis_par: 'T', soumis_le: HORO.soumis, valide_par: 'T', valide_le: HORO.valide }, hasher);
  const r = P.publier(etat, a, validee, { publication_id: 'PUB-2', autre_import_en_cours: true }, hasher);
  assert.equal(r.ok, false);
  assert.deepEqual(r.refus, ['PUB_ABSENTE_SANS_DECISION', 'PUB_A_NON_ACQUITTE', 'PUB_BND_OUVERT', 'PUB_B_NON_DEROGE', 'PUB_CHECKLIST',
    'PUB_DEROGATION_INVALIDE', 'PUB_IMPORT_EN_COURS']);
});

test('Publication (A7) : données, décisions, version ou checksum modifiés après validation → refus', () => {
  const etat = base();
  const a = analyser(etat, cloner(BASE).slice(0, 3));
  const validee = P.valider(etat, a, choixComplets(a, { 'CLI-UNIT|2026|AC|PROV-17': 'REPORTER' }), hasher);
  const opt = { publication_id: 'PUB-2', horodatage: HORO.valide };
  const altere = cloner(a);
  altere.comparaison.lignesRetenues[0].h_desc = 'v1:altere';
  assert.deepEqual(P.publier(etat, altere, validee, opt, hasher).refus, ['PUB_STAGING_MODIFIE']);
  const decisionAlteree = cloner(validee);
  decisionAlteree.decisions.find((d) => d.type === 'ABSENTE').choix = 'ACCEPTER';
  assert.deepEqual(P.publier(etat, a, decisionAlteree, opt, hasher).refus, ['PUB_STAGING_MODIFIE']);
  const autreEtat = cloner(etat);
  autreEtat.actif[0].ecriture_lib = 'modifié à la main';
  assert.deepEqual(P.publier(autreEtat, a, validee, opt, hasher).refus, ['PUB_BASE_MODIFIEE']);
  // Même actif, version différente (publication intercalée puis annulée : effet ABA évité).
  const intercale = cloner(etat);
  intercale.publications.push(Object.assign({}, intercale.publications[0], { publication_id: 'PUB-X', type_pub: 'ANNULATION' }));
  assert.deepEqual(P.publier(intercale, a, validee, opt, hasher).refus, ['PUB_BASE_MODIFIEE']);
  const r = P.publier(etat, a, validee, opt, hasher);
  assert.equal(r.ok, true, JSON.stringify(r.refus));
  assert.ok(r.etat.actif.some((l) => l.ecriture_num === 'PROV-17' && l.statut === 'ACTIVE'));
});

test('Dérogations (A5, P1) : reconduites seulement si identité, périmètre d\'exercice et contexte identiques', () => {
  const etat = base();
  const f = cloner(BASE).slice(0, 3);
  const e2 = publierTout(P, etat, analyser(etat, f), 'PUB-2', { 'CLI-UNIT|2026|AC|PROV-17': 'REPORTER' });
  // Même contenu, même périmètre : la dérogation VOL_SUPPR_MASSE est reconduite (PROV-17 reportée reste active).
  const b = analyser(e2, f);
  assert.deepEqual(b.decisions_reconduites.map((d) => d.anomalie_id), ['VOL_SUPPR_MASSE|FICHIER|']);
  assert.equal(b.decisions_reconduites[0].origine, 'RECONDUCTION');
  assert.equal(b.decisions_reconduites[0].par, 'SYSTEME');
  // Anomalie de niveau fichier : une autre période casse la reconduction.
  const c = analyser(e2, f, { perimetre: { exercice_id: '2026', du: '2026-01-01', au: '2026-03-30' } });
  assert.deepEqual(c.decisions_reconduites, []);
  // La reconduction entre dans la validation et suffit à lever la B.
  const choix = choixComplets(b, { 'CLI-UNIT|2026|AC|PROV-17': 'REPORTER' });
  choix.decisions = choix.decisions.filter((d) => d.type !== 'DEROGATION');
  const validee = P.valider(e2, b, choix, hasher);
  assert.equal(validee.decisions.filter((d) => d.origine === 'RECONDUCTION').length, 1);
  assert.equal(P.publier(e2, b, validee, { publication_id: 'PUB-3' }, hasher).ok, true);
});

test('Dérogations (P2) : total absent d\'un grand livre = dérogation motivée, jamais reconduite', () => {
  const gl = Object.assign({}, PROFIL_FEC, { profil_id: 'GL_UNIT', type: 'GL', contiguite_ecritures: false });
  const etat0 = P.etatInitial(CLIENT.client_id);
  const a = analyser(etat0, BASE, { profil: gl, fichier: { texte: fec(BASE), nomFichier: 'gl.csv', sha256: 'gl-1' } });
  const total = a.anomalies.find((x) => x.code === 'REC_TOTAL_SAISI');
  assert.equal(total.objet_cle, 'TOTAL_ABSENT');
  assert.equal(total.gravite, 'B');
  const e1 = publierTout(P, etat0, a, 'PUB-1');
  const b = analyser(e1, BASE, { profil: gl, fichier: { texte: fec(BASE), nomFichier: 'gl.csv', sha256: 'gl-2' } });
  assert.ok(b.anomalies.some((x) => x.anomalie_id === total.anomalie_id && x.empreinte_derogation === total.empreinte_derogation), 'même empreinte');
  assert.deepEqual(b.decisions_reconduites, [], 'P2 : dérogation exceptionnelle non reconduite');
});

test('Exercice clôturé (P5) : ABSENTE = une seule anomalie B, levée par une décision motivée, sans dérogation séparée', () => {
  const p2025 = { exercice_id: '2025', du: '2025-01-01', au: '2025-12-31' };
  const ouvert = cloner(CLIENT); ouvert.exercices[0].statut = 'OUVERT';
  const e2025 = [
    { journal: 'VT', num: '1', date: '20251015', valid: '20251231', lignes: [{ compte: '411', d: 1000 }, { compte: '706', c: 1000 }] },
    { journal: 'BQ', num: '2', date: '20251020', valid: '20251231', lignes: [{ compte: '512', d: 1000 }, { compte: '411', c: 1000 }] },
    { journal: 'OD', num: '3', date: '20251031', valid: '20251231', lignes: [{ compte: '6226', d: 500 }, { compte: '4081', c: 500 }] }
  ];
  let etat = P.etatInitial(CLIENT.client_id);
  etat = publierTout(P, etat, analyser(etat, e2025, { perimetre: p2025, client: ouvert }), 'PUB-1');
  const f = cloner(e2025).slice(0, 2);
  f[0].lignes[0].d = 1100; f[0].lignes[1].c = 1100;
  f[1].lignes[1].let = 'A';
  const a = analyser(etat, f, { perimetre: p2025 });
  assert.deepEqual(codes(a), ['IDN_ABSENTE:B', 'IDN_MOD_FOND:A', 'IDN_MOD_LET:I', 'PER_CLOTURE:B', 'VOL_SUPPR_MASSE:B']);
  assert.equal(a.anomalies.find((x) => x.code === 'IDN_ABSENTE').mention, 'EXERCICE_CLOTURE');
  assert.equal(a.anomalies.filter((x) => x.code === 'PER_CLOTURE').length, 1, 'pas de PER_CLOTURE en double pour l\'ABSENTE');
  const opt = { publication_id: 'PUB-2' };
  const court = P.valider(etat, a, choixComplets(a, null, { motifAbsente: 'trop court' }), hasher);
  assert.ok(P.publier(etat, a, court, opt, hasher).refus.includes('PUB_ABSENTE_CLOTURE_NON_MOTIVEE'));
  const motive = P.valider(etat, a, choixComplets(a), hasher);
  assert.ok(!motive.decisions.some((d) => d.type === 'DEROGATION' && d.anomalie_id.startsWith('IDN_ABSENTE')));
  assert.equal(P.publier(etat, a, motive, opt, hasher).ok, true);
});

test('Réapparition (P4) : code informatif IDN_REAPPARITION et mouvement tracé REACTIVATION', () => {
  const etat = base();
  const e2 = publierTout(P, etat, analyser(etat, cloner(BASE).slice(0, 3)), 'PUB-2');
  const prov = e2.actif.filter((l) => l.ecriture_num === 'PROV-17');
  assert.ok(prov.length === 2 && prov.every((l) => l.statut === 'SUPPRIMEE_SOURCE' && l.version === 2));
  const b = analyser(e2, BASE);
  assert.equal(statuts(b)['AC|PROV-17'], 'NOUVELLE');
  const reap = b.anomalies.find((x) => x.code === 'IDN_REAPPARITION');
  assert.equal(reap.gravite, 'I');
  assert.deepEqual(reap.cles, ['CLI-UNIT|2026|AC|PROV-17']);
  const e3 = publierTout(P, e2, b, 'PUB-3');
  const mvts = e3.mouvements.filter((m) => m.publication_id === 'PUB-3' && m.cle_ecriture.endsWith('PROV-17'));
  assert.ok(mvts.length === 2 && mvts.every((m) => m.sous_types.includes('REACTIVATION') && m.image_avant.statut === 'SUPPRIMEE_SOURCE'));
  assert.ok(e3.actif.filter((l) => l.ecriture_num === 'PROV-17').every((l) => l.statut === 'ACTIVE' && l.version === 3));
});

test('Réimport : même empreinte de fichier = REIMPORT_FICHIER ; redevient possible après annulation', () => {
  const etat0 = P.etatInitial(CLIENT.client_id);
  const fichier = { texte: fec(BASE), nomFichier: NOM_FEC, sha256: 'sha-fixe' };
  const args = { fichier, profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, identite: identite(), hasher };
  const etat1 = publierTout(P, etat0, P.analyserImport(Object.assign({ etat: etat0, import_id: 'I1' }, args)), 'PUB-1');
  const b = P.analyserImport(Object.assign({ etat: etat1, import_id: 'I2' }, args));
  assert.equal(b.statut, 'REIMPORT_FICHIER');
  assert.equal(b.rejete, false);
  assert.deepEqual(P.publier(etat1, b, null, { publication_id: 'PUB-2' }, hasher).refus, ['PUB_REIMPORT']);
  const u = P.annulerDernierePublication(etat1, { publication_id: 'ANN-1' }, hasher);
  assert.equal(u.ok, true);
  const c = P.analyserImport(Object.assign({ etat: u.etat, import_id: 'I3' }, args));
  assert.equal(c.statut, 'ANALYSE');
  assert.equal(c.comparaison.compteurs.par_statut.NOUVELLE, 4);
});

test('Retour arrière : checksum N-1 retrouvé, une seule profondeur, mouvements en ajout seul, tampon inactif vérifié', () => {
  const etat1 = base();
  const f = cloner(BASE);
  f[0].lignes[0].d = 55000; f[0].lignes[2].c = 65000;
  const etat2 = publierTout(P, etat1, analyser(etat1, f), 'PUB-2');
  assert.deepEqual(P.annulerDernierePublication(etat2, { publication_id: 'ANN-0', tampon_inactif: [] }, hasher).refus, ['ANN_TAMPON_DIVERGENT']);
  assert.deepEqual(P.annulerDernierePublication(etat2, { publication_id: 'ANN-0', import_en_cours: true }, hasher).refus, ['ANN_IMPORT_EN_COURS']);
  const u = P.annulerDernierePublication(etat2, { publication_id: 'ANN-1', tampon_inactif: etat1.actif }, hasher);
  assert.equal(u.ok, true, JSON.stringify(u.refus));
  assert.equal(Publication.checksumActif(u.etat.actif, hasher), Publication.checksumActif(etat1.actif, hasher));
  assert.deepEqual(u.etat.mouvements.slice(0, etat2.mouvements.length), etat2.mouvements);
  assert.ok(u.etat.mouvements.slice(etat2.mouvements.length).every((m) => m.type === 'ANNULATION' && m.annule_mouvement_id));
  assert.equal(u.etat.publications.find((p) => p.publication_id === 'PUB-2').statut, 'ANNULEE');
  assert.deepEqual(P.annulerDernierePublication(u.etat, { publication_id: 'ANN-2' }, hasher).refus, ['ANN_TYPE']);
});

test('Retour arrière refusé si l\'actif a été altéré ; altération détectée à l\'import suivant', () => {
  const etat = base();
  const altere = cloner(etat);
  altere.actif[0].debit_cts += 100;
  assert.deepEqual(P.annulerDernierePublication(altere, { publication_id: 'ANN-1' }, hasher).refus, ['ANN_ACTIF_ALTERE']);
  const a = analyser(altere, BASE);
  assert.ok(a.anomalies.some((x) => x.code === 'SYS_ACTIF_ALTERE' && x.gravite === 'BND'));
  assert.equal(a.rejete, true);
});

test('Exercice clôturé : PER_CLOTURE sur montant ; lettrage seul accepté', () => {
  const p2025 = { exercice_id: '2025', du: '2025-01-01', au: '2025-12-31' };
  const ouvert = cloner(CLIENT); ouvert.exercices[0].statut = 'OUVERT';
  const e2025 = [
    { journal: 'VT', num: '1', date: '20251015', valid: '20251231', lignes: [{ compte: '411', d: 1000 }, { compte: '706', c: 1000 }] },
    { journal: 'BQ', num: '2', date: '20251020', valid: '20251231', lignes: [{ compte: '512', d: 1000 }, { compte: '411', c: 1000 }] }
  ];
  let etat = P.etatInitial(CLIENT.client_id);
  etat = publierTout(P, etat, analyser(etat, e2025, { perimetre: p2025, client: ouvert }), 'PUB-1');
  const f = cloner(e2025);
  f[0].lignes[0].d = 1100; f[0].lignes[1].c = 1100;
  f[1].lignes[1].let = 'A';
  assert.deepEqual(codes(analyser(etat, f, { perimetre: p2025 })), ['IDN_MOD_FOND:A', 'IDN_MOD_LET:I', 'PER_CLOTURE:B']);
});

test('Profils : mélange de sources interdit (A4) ; grand livre sans colonne de numéro refusé (A1)', () => {
  const etat = base();
  const gl = Object.assign({}, PROFIL_FEC, { profil_id: 'GL_UNIT', type: 'GL' });
  const a = analyser(etat, BASE, { profil: gl });
  assert.ok(a.anomalies.some((x) => x.code === 'PRF_CHANGEMENT' && x.gravite === 'BND'));
  assert.equal(a.lecture, null, 'contrôlé avant la lecture');

  const glNum = {
    profil_id: 'GL_NUM', version: 1, type: 'GL', encodage: 'UTF-8', separateur: ';', decimal: ',', format_date: 'JJ/MM/AAAA',
    mode_sens: 'DEBIT_CREDIT', contiguite_ecritures: false, portee_numerotation: 'EXERCICE',
    colonnes: { Compte: 'compte_num', Date: 'ecriture_date', Journal: 'journal_code', 'N° écriture': 'ecriture_num', Libellé: 'ecriture_lib', Débit: 'debit', Crédit: 'credit' }
  };
  const texte = 'Compte;Date;Journal;Libellé;Débit;Crédit\n411;15/01/2026;VT;Vente;100,00;\n';
  const run = (profil) => P.analyserImport({ etat: P.etatInitial(CLIENT.client_id), fichier: { texte, nomFichier: 'gl.csv', sha256: 'x' },
    profil, client: CLIENT, perimetre: PERIMETRE_T1, identite: identite(), import_id: 'I', hasher });
  const b = run(glNum);
  const entete = b.anomalies.filter((x) => x.code === 'STR_ENTETE');
  assert.equal(entete.length, 1);
  assert.match(entete[0].message, /exporter le FEC/);
  assert.equal(b.rejete, true);
  const sansNum = cloner(glNum); delete sansNum.colonnes['N° écriture'];
  assert.throws(() => run(sansNum), { name: 'ErreurContrat', code: 'PROFIL_INVALIDE', message: 'PROFIL_INVALIDE' });
});

test('Identité (P6) : un FEC n\'est jamais rejeté sur le seul nom ; toute source contradictoire bloque', () => {
  const etat = P.etatInitial(CLIENT.client_id);
  const nom = (n, id) => analyser(etat, BASE, { fichier: { texte: fec(BASE), nomFichier: n, sha256: n }, identite: id });
  const a = nom('export_compta.txt', identite());
  assert.deepEqual(codes(a), ['CLI_NOM_FEC_NON_CONFORME:A']);
  assert.equal(a.rejete, false);
  assert.deepEqual(codes(nom('export_compta.txt', {})), ['CLI_IDENTITE_NON_CONFIRMEE:B', 'CLI_NOM_FEC_NON_CONFORME:A']);
  assert.deepEqual(codes(nom(NOM_FEC, {})), ['CLI_IDENTITE_NON_CONFIRMEE:B'], 'le nom seul ne confirme pas l\'identité');
  assert.deepEqual(codes(nom(NOM_FEC, { siren_declare: CLIENT.siren })), []);
  for (const [n, id] of [['888888888FEC20261231.txt', identite()], [NOM_FEC, { dossier_client_id: 'CLI-AUTRE' }], [NOM_FEC, { siren_declare: '888888888' }]]) {
    const r = nom(n, id);
    assert.ok(r.anomalies.some((x) => x.code === 'CLI_MISMATCH'), n);
    assert.equal(r.rejete, true);
    assert.equal(r.lecture, null, 'aucune lecture du contenu');
  }
});

test('Isolation : état d\'un autre client refusé ; clés préfixées par le client', () => {
  const autre = Object.assign(cloner(CLIENT), { client_id: 'CLI-AUTRE', siren: '888888888' });
  assert.throws(() => analyser(P.etatInitial(CLIENT.client_id), BASE, { client: autre }), { code: 'CLIENT_INCOHERENT' });
  const c = analyser(P.etatInitial('CLI-AUTRE'), BASE, { client: autre, fichier: { texte: fec(BASE), nomFichier: '888888888FEC20261231.txt', sha256: 'y' } });
  assert.equal(c.rejete, false);
  assert.ok(c.comparaison.ecritures.every((e) => e.cle.startsWith('CLI-AUTRE|')));
});

test('Contrôle A6 : double saisie, écart, nombre de lignes ; un total concordant ne masque pas un déséquilibre', () => {
  const etat = P.etatInitial(CLIENT.client_id);
  const ok = { debit_cts: 240000, credit_cts: 240000, debit_cts_confirmation: 240000, credit_cts_confirmation: 240000, nb_lignes: 9 };
  assert.deepEqual(codes(analyser(etat, BASE, { totalSaisi: ok })), []);
  const confirmation = Object.assign({}, ok, { credit_cts_confirmation: 240100 });
  assert.deepEqual(analyser(etat, BASE, { totalSaisi: confirmation }).anomalies.map((x) => x.objet_cle), ['SAISIE_NON_CONFIRMEE']);
  const ecart = Object.assign({}, ok, { debit_cts: 240001, debit_cts_confirmation: 240001, nb_lignes: 8 });
  assert.deepEqual(analyser(etat, BASE, { totalSaisi: ecart }).anomalies.map((x) => x.objet_cle).sort(), ['ECART', 'NB_LIGNES']);
  const desequilibre = cloner(BASE); desequilibre[0].lignes[0].d += 1;
  const c = analyser(etat, desequilibre, { totalSaisi: Object.assign({}, ok, { debit_cts: 240001, debit_cts_confirmation: 240001 }) });
  assert.ok(codes(c).includes('EQU_GLOBAL:BND') && codes(c).includes('EQU_ECRITURE:B'));
  assert.ok(c.controles.some((x) => x.control_id === 'REC_TOTAL_SAISI' && x.ok), 'le total saisi concorde, le déséquilibre reste détecté');
});

test('Restitution : liste des contrôles et variations triées par écart absolu', () => {
  const etat = base();
  const f = cloner(BASE);
  f[0].lignes = [{ compte: '607', d: 55000 }, { compte: '44566', d: 11000 }, { compte: '401', aux: '0012', c: 66000 }];
  const a = analyser(etat, f);
  assert.deepEqual(a.controles.map((c) => c.control_id + ':' + c.ok), ['REC_LIGNES:true', 'REC_TOTAUX:true', 'REC_MIROIR:true', 'EQU_GLOBAL:true', 'VOL_SUPPR_MASSE:true']);
  assert.deepEqual(a.variations, [
    { compte: '40100000', avant_cts: -90000, apres_cts: -96000, delta_cts: -6000 },
    { compte: '60700000', avant_cts: 50000, apres_cts: 55000, delta_cts: 5000 },
    { compte: '44566000', avant_cts: 10000, apres_cts: 11000, delta_cts: 1000 }
  ]);
});

test('Empreinte de dérogation (A5, P1) : stable si tout est identique, différente si un composant change', () => {
  const an = Anomalies.creer('EQU_ECRITURE', { objet_type: 'ECRITURE', objet_cle: 'K', attendu: 100, obtenu: 101 });
  an.empreinte_objet = 'h1';
  const ctx = { perimetre: PERIMETRE_T1, statut_exercice: 'OUVERT', profil_id: 'FEC_UNIT', profil_version: 1 };
  const e1 = Anomalies.empreinteDerogation(an, ctx, hasher);
  assert.equal(Anomalies.empreinteDerogation(cloner(an), cloner(ctx), hasher), e1);
  // P1 : pour une écriture, la période déclarée ne compte pas ; l'exercice, si.
  assert.equal(Anomalies.empreinteDerogation(an, Object.assign({}, ctx, { perimetre: { exercice_id: '2026', du: '2026-01-01', au: '2026-04-30' } }), hasher), e1);
  for (const [a2, c2] of [
    [Object.assign({}, an, { empreinte_objet: 'h2' }), ctx], [Object.assign({}, an, { gravite: 'A' }), ctx],
    [an, Object.assign({}, ctx, { perimetre: { exercice_id: '2025', du: '2025-01-01', au: '2025-03-31' } })],
    [an, Object.assign({}, ctx, { statut_exercice: 'CLOTURE' })], [an, Object.assign({}, ctx, { profil_version: 2 })],
    [an, Object.assign({}, ctx, { profil_id: 'GL' })]
  ]) assert.notEqual(Anomalies.empreinteDerogation(a2, c2, hasher), e1);
  const fichier = Anomalies.creer('VOL_SUPPR_MASSE', { obtenu: '2/14' });
  const autre = Object.assign({}, ctx, { perimetre: { exercice_id: '2026', du: '2026-01-01', au: '2026-04-30' } });
  assert.notEqual(Anomalies.empreinteDerogation(fichier, autre, hasher), Anomalies.empreinteDerogation(fichier, ctx, hasher));
});

test('Décisions : acquittement sans joker, dérogation refusée sur un BND ; entrées non modifiées', () => {
  const a = [Anomalies.creer('IDN_MOD_FOND', { objet_type: 'ECRITURE', objet_cle: 'K' }), Anomalies.creer('EQU_GLOBAL', {})];
  a[0].empreinte_derogation = 'x'; a[1].empreinte_derogation = 'y';
  const r = Anomalies.appliquerDecisions(a, [
    { decision_id: 'A1', type: 'ACQUITTEMENT', code: 'IDN_MOD_FOND', anomalie_ids: ['*'], par: 'T' },
    { decision_id: 'D1', type: 'DEROGATION', anomalie_id: a[1].anomalie_id, empreinte_derogation: 'y', motif: MOTIF_TEST, par: 'T' }
  ]);
  assert.deepEqual(r.erreurs, [{ code: 'PUB_ACQUITTEMENT_INVALIDE', decision_id: 'A1' }, { code: 'PUB_DEROGATION_INVALIDE', decision_id: 'D1' }]);
  assert.deepEqual(r.anomalies.map((x) => x.statut), ['OUVERTE', 'OUVERTE']);
  assert.deepEqual(a.map((x) => x.statut), ['OUVERTE', 'OUVERTE']);
});

test('Validation : check-list obligatoire et horodatages cohérents', () => {
  const etat = P.etatInitial(CLIENT.client_id);
  const a = analyser(etat, BASE);
  const choix = choixComplets(a);
  choix.valide_le = '2026-10-09T09:00:00Z'; // antérieure à la soumission
  assert.deepEqual(P.publier(etat, a, P.valider(etat, a, choix, hasher), { publication_id: 'P' }, hasher).refus, ['PUB_VALIDATION_ABSENTE']);
  const sansListe = choixComplets(a); sansListe.checklist = Object.assign({}, CHECKLIST_OK, { variations_expliquees: false });
  assert.deepEqual(P.publier(etat, a, P.valider(etat, a, sansListe, hasher), { publication_id: 'P' }, hasher).refus, ['PUB_CHECKLIST']);
});
