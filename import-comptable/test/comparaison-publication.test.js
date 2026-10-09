'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/app/pipeline');
const Publication = require('../src/core/publication');
const { hasher, CLIENT, PROFIL_FEC, PERIMETRE_T1, NOM_FEC, fec, cloner, choixComplets, CHECKLIST_OK, MOTIF_TEST } = require('./aides');

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

function analyser(etat, ecritures, extra) {
  return P.analyserImport(Object.assign({
    etat, fichier: { texte: fec(ecritures), nomFichier: NOM_FEC, sha256: 'sha-' + Math.random() },
    profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, import_id: 'I-' + Math.random(), hasher
  }, extra || {}));
}

function publierTout(etat, analyse, id, decisions) {
  const v = P.valider(etat, analyse, choixComplets(analyse, decisions), hasher);
  const r = P.publier(etat, analyse, v, id, hasher);
  assert.equal(r.ok, true, JSON.stringify(r.refus));
  return r.etat;
}

function base() {
  const etat = P.etatInitial(CLIENT.client_id);
  const a = analyser(etat, BASE);
  assert.equal(a.rejete, false, JSON.stringify(a.anomalies));
  return publierTout(etat, a, 'PUB-1');
}

function statuts(analyse) {
  return Object.fromEntries(analyse.comparaison.ecritures.map((e) => [e.cle.split('|').slice(2).join('|'), [e.statut, ...e.sous_types].join(' ')]));
}

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
  assert.deepEqual(a.variationsSoldes, { '40100000': -6000 + 30000 - 30000, '40810000': 30000, '44566000': 1000, '60700000': 5000, '62260000': -30000 });
  const codes = a.anomalies.map((x) => x.code).sort();
  assert.deepEqual(codes, ['IDN_ABSENTE', 'IDN_ABSENTE', 'IDN_MOD_FOND', 'IDN_MOD_LET', 'VOL_SUPPR_MASSE']);
  const prov = a.anomalies.find((x) => x.objet_cle.endsWith('PROV-17'));
  assert.match(prov.message, /brouillard/);
});

test('Classification : M_DATE et M_DESC distingués du fond ; ordre des lignes indifférent', () => {
  const etat = base();
  const f = cloner(BASE);
  f[0].date = '20260211';
  f[0].pieceDate = '20260210'; // seule la date d'écriture change
  f[1].lignes.reverse();
  f[2].lib = 'Honoraires corrigés';
  const a = analyser(etat, f);
  const s = statuts(a);
  assert.equal(s['AC|000045'], 'MODIFIEE M_DATE');
  assert.equal(s['BQ|000210'], 'INCHANGEE');
  assert.equal(s['OD|000012'], 'MODIFIEE M_DESC');
});

test('Doublon intra-fichier : un bloc conservé ; collisions (contenu, dates) bloquantes', () => {
  const etat = P.etatInitial(CLIENT.client_id);
  const vt = { journal: 'VT', num: '000124', date: '20260310', lignes: [{ compte: '411', d: 1000 }, { compte: '706', c: 1000 }] };
  const a = analyser(etat, [vt, BASE[1], cloner(vt)]);
  assert.equal(a.comparaison.compteurs.DOUBLON_INTRA, 1);
  assert.equal(a.comparaison.lignesDoublonsIgnorees, 2);
  assert.equal(a.rejete, false);

  const autre = cloner(vt); autre.lignes = [{ compte: '411', d: 2000 }, { compte: '706', c: 2000 }];
  const dateDiff = { journal: 'OD', num: '9', date: '20260101', lignes: [{ compte: '6226', d: 100 }] };
  const dateDiff2 = { journal: 'OD', num: '9', date: '20260102', lignes: [{ compte: '4081', c: 100 }] };
  const b = analyser(etat, [vt, BASE[1], autre, dateDiff, dateDiff2]);
  const collisions = b.comparaison.ecritures.filter((e) => e.statut === 'COLLISION').map((e) => e.motif).sort();
  assert.deepEqual(collisions, ['BLOCS_DIFFERENTS', 'DATES_MULTIPLES']);
  assert.equal(b.rejete, true);
});

test('Chevauchement : aucune ABSENTE hors du périmètre déclaré', () => {
  const etat = base();
  const a = analyser(etat, [BASE[3]], { perimetre: { exercice_id: '2026', du: '2026-03-01', au: '2026-04-30' } });
  assert.deepEqual(a.comparaison.compteurs.ABSENTE, 0);
  assert.equal(statuts(a)['AC|PROV-17'], 'INCHANGEE');
});

test('Publication (T15) : refus cumulés — BND, B non dérogé, A non acquitté, ABSENTE sans décision, motif court, check-list', () => {
  const etat = base();
  const f = cloner(BASE).slice(0, 3);
  f[0].lignes[0].d += 1; // déséquilibre : EQU_ECRITURE (B) + EQU_GLOBAL (BND)
  const a = analyser(etat, f);
  const codes = a.anomalies.map((x) => x.code + ':' + x.gravite).sort();
  assert.deepEqual(codes, ['EQU_ECRITURE:B', 'EQU_GLOBAL:BND', 'IDN_ABSENTE:A', 'IDN_MOD_FOND:A', 'VOL_SUPPR_MASSE:B']);
  const vol = a.anomalies.find((x) => x.code === 'VOL_SUPPR_MASSE');
  const v = P.valider(etat, a, { derogations: [{ anomalie_id: vol.anomalie_id, motif: 'x'.repeat(19), par: 'TEST' }] }, hasher);
  const r = P.publier(etat, a, v, 'PUB-2', hasher);
  assert.equal(r.ok, false);
  assert.deepEqual(r.refus.map((x) => x.code), ['CHECKLIST_INCOMPLETE', 'ANOMALIE_BND', 'DEROGATION_INVALIDE',
    'BLOQUANT_NON_DEROGE', 'AVERTISSEMENT_NON_ACQUITTE', 'DECISION_MANQUANTE']);
});

test('Publication (A7) : données ou version modifiées après validation = refus ; décision REPORTER conserve l\'écriture', () => {
  const etat = base();
  const a = analyser(etat, cloner(BASE).slice(0, 3));
  const v = P.valider(etat, a, choixComplets(a, { 'CLI-UNIT|2026|AC|PROV-17': 'REPORTER' }), hasher);
  const altere = cloner(a);
  altere.comparaison.ecritures[0].lignes[0].debit_cts += 1;
  assert.equal(P.publier(etat, altere, v, 'PUB-2', hasher).code, 'STAGING_MODIFIE');
  const anomalieAlteree = cloner(a);
  anomalieAlteree.anomalies[0].gravite = 'I';
  assert.ok(P.publier(etat, anomalieAlteree, v, 'PUB-2', hasher).refus.some((x) => x.code === 'STAGING_MODIFIE'));
  const autreEtat = cloner(etat);
  autreEtat.actif[0].ecriture_lib = 'modifié à la main';
  assert.equal(P.publier(autreEtat, a, v, 'PUB-2', hasher).code, 'VERSION_BASE_MODIFIEE');
  // Même actif mais version différente (publication intercalée puis annulée : effet ABA évité)
  const intercale = cloner(etat);
  intercale.publications = intercale.publications.concat([{ publication_id: 'PUB-X', type_pub: 'ANNULATION', checksum_apres: intercale.publications[0].checksum_apres }]);
  assert.equal(P.publier(intercale, a, v, 'PUB-2', hasher).code, 'VERSION_BASE_MODIFIEE');
  const r = P.publier(etat, a, v, 'PUB-2', hasher);
  assert.equal(r.ok, true, JSON.stringify(r.refus));
  assert.ok(r.etat.actif.some((l) => l.ecriture_num === 'PROV-17' && l.statut === 'ACTIVE'));
});

test('Dérogations (A5) : reconduites seulement si anomalie, périmètre et contexte identiques', () => {
  const etat = base();
  const a = analyser(etat, cloner(BASE).slice(0, 3));
  const e2 = publierTout(etat, a, 'PUB-2', { 'CLI-UNIT|2026|AC|PROV-17': 'REPORTER' });
  // Import suivant : même contenu, PROV-17 toujours absente → même VOL_SUPPR_MASSE ? Non : la base a changé
  // de taille ? Non (PROV-17 reportée reste active) → anomalie identique → reconduite.
  const b = analyser(e2, cloner(BASE).slice(0, 3));
  assert.deepEqual(b.derogationsReconduites.map((d) => d.anomalie_id), ['VOL_SUPPR_MASSE|FICHIER|']);
  assert.equal(b.derogationsReconduites[0].origine, 'RECONDUCTION');
  // Périmètre différent → empreinte différente → pas de reconduction.
  const c = analyser(e2, cloner(BASE).slice(0, 3), { perimetre: { exercice_id: '2026', du: '2026-01-01', au: '2026-03-30' } });
  assert.deepEqual(c.derogationsReconduites, []);
  // Une B reconduite suffit à publier si tout le reste est traité ; la validation la couvre.
  const choix = choixComplets(b, { 'CLI-UNIT|2026|AC|PROV-17': 'REPORTER' });
  choix.derogations = [];
  const v = P.valider(e2, b, choix, hasher);
  assert.equal(v.derogations.length, 1);
  assert.equal(P.publier(e2, b, v, 'PUB-3', hasher).ok, true);
});

test('Publication : ABSENTE acceptée = suppression logique, jamais d\'effacement ; réapparition', () => {
  const etat = base();
  const a = analyser(etat, cloner(BASE).slice(0, 3));
  const e2 = publierTout(etat, a, 'PUB-2', { 'CLI-UNIT|2026|AC|PROV-17': 'ACCEPTER' });
  const prov = e2.actif.filter((l) => l.ecriture_num === 'PROV-17');
  assert.equal(prov.length, 2);
  assert.ok(prov.every((l) => l.statut === 'SUPPRIMEE_SOURCE' && l.version === 2));
  const b = analyser(e2, BASE);
  assert.equal(statuts(b)['AC|PROV-17'], 'NOUVELLE');
  assert.ok(b.anomalies.some((x) => x.code === 'IDN_REAPPARITION'));
});

test('Réimport : même empreinte de fichier = REIMPORT_FICHIER ; redevient possible après annulation', () => {
  const etat0 = P.etatInitial(CLIENT.client_id);
  const fichier = { texte: fec(BASE), nomFichier: NOM_FEC, sha256: 'sha-fixe' };
  const args = { fichier, profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, hasher };
  const a = P.analyserImport(Object.assign({ etat: etat0, import_id: 'I1' }, args));
  const etat1 = publierTout(etat0, a, 'PUB-1');
  const b = P.analyserImport(Object.assign({ etat: etat1, import_id: 'I2' }, args));
  assert.equal(b.statut, 'REIMPORT_FICHIER');
  assert.equal(b.rejete, false); // arrêt journalisé, pas un bloquant
  assert.equal(P.publier(etat1, b, null, 'PUB-2', hasher).code, 'REIMPORT_FICHIER');
  const u = P.annulerDernierePublication(etat1, 'ANN-1', hasher);
  assert.equal(u.ok, true);
  const c = P.analyserImport(Object.assign({ etat: u.etat, import_id: 'I3' }, args));
  assert.equal(c.statut, 'ANALYSE');
  assert.equal(c.comparaison.compteurs.NOUVELLE, 4);
});

test('Retour arrière : checksum N-1 retrouvé, une seule profondeur, mouvements en ajout seul', () => {
  const etat1 = base();
  const f = cloner(BASE);
  f[0].lignes[0].d = 55000; f[0].lignes[2].c = 65000; f[0].lignes[1].d = 10000;
  const a = analyser(etat1, f);
  const etat2 = publierTout(etat1, a, 'PUB-2');
  const u = P.annulerDernierePublication(etat2, 'ANN-1', hasher);
  assert.equal(u.ok, true);
  assert.equal(Publication.checksumActif(u.etat.actif, hasher).checksum, Publication.checksumActif(etat1.actif, hasher).checksum);
  assert.equal(u.etat.mouvements.length > etat2.mouvements.length, true);
  assert.deepEqual(u.etat.mouvements.slice(0, etat2.mouvements.length), etat2.mouvements);
  assert.equal(P.annulerDernierePublication(u.etat, 'ANN-2', hasher).code, 'ANNULATION_NON_ANNULABLE');
});

test('Retour arrière : refusé si l\'actif a été altéré depuis la publication ; altération détectée à l\'import suivant', () => {
  const etat = base();
  const altere = cloner(etat);
  altere.actif[0].debit_cts += 100;
  assert.equal(P.annulerDernierePublication(altere, 'ANN-1', hasher).code, 'ACTIF_DIFFERENT_DE_N');
  const a = analyser(altere, BASE);
  assert.ok(a.anomalies.some((x) => x.code === 'SYS_ACTIF_ALTERE' && x.gravite === 'BND'));
  assert.equal(a.rejete, true);
});

test('Exercice clôturé : PER_CLOTURE sur montant ; lettrage seul accepté', () => {
  const p2025 = { exercice_id: '2025', du: '2025-01-01', au: '2025-12-31' };
  const clientOuvert = cloner(CLIENT); clientOuvert.exercices[0].statut = 'OUVERT';
  const e2025 = [
    { journal: 'VT', num: '1', date: '20251015', valid: '20251231', lignes: [{ compte: '411', d: 1000 }, { compte: '706', c: 1000 }] },
    { journal: 'BQ', num: '2', date: '20251020', valid: '20251231', lignes: [{ compte: '512', d: 1000 }, { compte: '411', c: 1000 }] }
  ];
  let etat = P.etatInitial(CLIENT.client_id);
  const a = analyser(etat, e2025, { perimetre: p2025, client: clientOuvert });
  etat = publierTout(etat, a, 'PUB-1');
  const f = cloner(e2025);
  f[0].lignes[0].d = 1100; f[0].lignes[1].c = 1100;
  f[1].lignes[1].let = 'A';
  const b = analyser(etat, f, { perimetre: p2025 });
  const parCode = b.anomalies.map((x) => x.code + ':' + x.gravite + ':' + x.objet_cle.split('|').slice(2).join('|')).sort();
  assert.deepEqual(parCode, ['IDN_MOD_FOND:A:VT|1', 'IDN_MOD_LET:I:BQ|2', 'PER_CLOTURE:B:VT|1']);
});

test('Profils : mélange de sources interdit (A4) et grand livre sans numéro refusé (A1)', () => {
  const etat = base();
  const gl = Object.assign({}, PROFIL_FEC, { profil_id: 'GL_UNIT', type: 'GL' });
  const a = analyser(etat, BASE, { profil: gl });
  assert.ok(a.anomalies.some((x) => x.code === 'PRF_CHANGEMENT' && x.gravite === 'BND'));

  const glSansNum = {
    profil_id: 'GL_SANS', version: 1, type: 'GL', encodage: 'UTF-8', separateur: ';', decimal: ',', format_date: 'JJ/MM/AAAA',
    mode_sens: 'DEBIT_CREDIT', colonnes: { Compte: 'compte_num', Date: 'date', Journal: 'journal_code', Libellé: 'ecriture_lib', Débit: 'debit', Crédit: 'credit' }
  };
  glSansNum.colonnes.Date = 'ecriture_date';
  const texte = 'Compte;Date;Journal;Libellé;Débit;Crédit\n411;15/01/2026;VT;Vente;100,00;\n';
  const b = P.analyserImport({ etat: P.etatInitial(CLIENT.client_id), fichier: { texte, nomFichier: 'gl.csv', sha256: 'x' },
    profil: glSansNum, client: CLIENT, perimetre: PERIMETRE_T1, import_id: 'I', hasher });
  const entete = b.anomalies.filter((x) => x.code === 'STR_ENTETE');
  assert.equal(entete.length, 1);
  assert.match(entete[0].message, /exporter le FEC/);
  assert.equal(b.rejete, true);
});

test('Isolation : clés préfixées par le client ; état d\'un autre client refusé ; SIREN contrôlé', () => {
  const autre = Object.assign(cloner(CLIENT), { client_id: 'CLI-AUTRE', siren: '888888888' });
  const etatA = P.etatInitial(CLIENT.client_id);
  assert.throws(() => analyser(etatA, BASE, { client: autre }), /Isolation/);
  const b = analyser(P.etatInitial('CLI-AUTRE'), BASE, { client: autre });
  assert.ok(b.anomalies.some((x) => x.code === 'CLI_MISMATCH'));
  assert.equal(b.rejete, true);
  const c = analyser(P.etatInitial('CLI-AUTRE'), BASE, { client: autre, fichier: { texte: fec(BASE), nomFichier: '888888888FEC20261231.txt', sha256: 'y' } });
  assert.equal(c.rejete, false);
  assert.ok(c.comparaison.ecritures.every((e) => e.cle.startsWith('CLI-AUTRE|')));
});

test('Contrôle A6 : total saisi comparé, mais contrôles indépendants maintenus', () => {
  const etat = P.etatInitial(CLIENT.client_id);
  const a = analyser(etat, BASE, { totalSaisi: { debit_cts: 240000, credit_cts: 240000 } });
  assert.ok(!a.anomalies.some((x) => x.code === 'REC_TOTAL_SAISI'));
  const b = analyser(etat, BASE, { totalSaisi: { debit_cts: 240001, credit_cts: 240000 } });
  assert.ok(b.anomalies.some((x) => x.code === 'REC_TOTAL_SAISI' && x.gravite === 'B'));
  const desequilibre = cloner(BASE); desequilibre[0].lignes[0].d += 1;
  const c = analyser(etat, desequilibre, { totalSaisi: { debit_cts: 240001, credit_cts: 240000 } });
  const codes = c.anomalies.map((x) => x.code);
  assert.ok(codes.includes('EQU_GLOBAL') && codes.includes('EQU_ECRITURE'), 'un total saisi concordant ne masque pas le déséquilibre');
});

test('Empreinte de dérogation (A5) : identique seulement si anomalie, périmètre et contexte identiques', () => {
  const Anomalies = require('../src/core/anomalies');
  const an = Anomalies.creer('EQU_ECRITURE', { objet_type: 'ECRITURE', objet_cle: 'K', attendu: 100, obtenu: 101 });
  const ctx = { perimetre: PERIMETRE_T1, profil_id: 'FEC_UNIT', profil_version: 1, empreinte_objet: 'h1' };
  const e1 = Anomalies.empreinteDerogation(an, ctx, hasher);
  assert.equal(Anomalies.empreinteDerogation(cloner(an), cloner(ctx), hasher), e1);
  assert.notEqual(Anomalies.empreinteDerogation(an, Object.assign({}, ctx, { empreinte_objet: 'h2' }), hasher), e1);
  // P1 : pour une écriture, le périmètre retenu est l'exercice (le contenu de l'écriture est figé par empreinte_objet).
  const autrePeriode = Object.assign({}, ctx, { perimetre: { exercice_id: '2026', du: '2026-01-01', au: '2026-04-30' } });
  assert.equal(Anomalies.empreinteDerogation(an, autrePeriode, hasher), e1);
  assert.notEqual(Anomalies.empreinteDerogation(an, Object.assign({}, ctx, { perimetre: { exercice_id: '2025', du: '2025-01-01', au: '2025-03-31' } }), hasher), e1);
  assert.notEqual(Anomalies.empreinteDerogation(an, Object.assign({}, ctx, { statut_exercice: 'CLOTURE' }), hasher), e1);
  // Pour une anomalie de niveau fichier, la période complète compte.
  const fichier = Anomalies.creer('VOL_SUPPR_MASSE', { obtenu: '2 / 14' });
  assert.notEqual(Anomalies.empreinteDerogation(fichier, autrePeriode, hasher), Anomalies.empreinteDerogation(fichier, ctx, hasher));
  assert.notEqual(Anomalies.empreinteDerogation(an, Object.assign({}, ctx, { profil_version: 2 }), hasher), e1);
  assert.notEqual(Anomalies.empreinteDerogation(Object.assign({}, an, { obtenu: 102 }), ctx, hasher), e1);
});
