'use strict';
/**
 * Tests de propriétés sur des jeux aléatoires à graine fixe (reproductibles).
 * L'oracle est la construction elle-même : chaque mutation appliquée a un statut attendu connu.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/app/pipeline');
const Publication = require('../src/core/publication');
const { hasher, CLIENT, PROFIL_FEC, PERIMETRE_T1, NOM_FEC, prng, fec, ecrituresAleatoires, melanger, cloner, choixComplets } = require('./aides');

const ITERATIONS = 60;
const TAILLE = 30;

let compteurSha = 0;
function analyser(etat, ecritures, options) {
  compteurSha++;
  return P.analyserImport({
    etat, fichier: { texte: fec(ecritures, options), nomFichier: NOM_FEC, sha256: 'sha-' + compteurSha },
    profil: PROFIL_FEC, client: (options && options.client) || CLIENT, perimetre: PERIMETRE_T1,
    import_id: 'I-' + compteurSha, hasher
  });
}

function publier(etat, analyse, id) {
  const v = P.valider(etat, analyse, choixComplets(analyse), hasher);
  const r = P.publier(etat, analyse, v, id, hasher);
  assert.equal(r.ok, true, r.code + ' ' + JSON.stringify(r.refus));
  return r.etat;
}

function checksum(etat) { return Publication.checksumActif(etat.actif, hasher).checksum; }

function etatPublie(alea) {
  const base = ecrituresAleatoires(alea, TAILLE);
  const etat0 = P.etatInitial(CLIENT.client_id);
  const a = analyser(etat0, base);
  assert.equal(a.rejete, false, JSON.stringify(a.anomalies.filter((x) => x.gravite === 'BND')));
  return { base, etat: publier(etat0, a, 'PUB-1') };
}

/** Applique des mutations aléatoires et renvoie le fichier modifié et les statuts attendus par clé courte. */
function muter(alea, base) {
  const attendus = {};
  const fichier = [];
  base.forEach((e0) => {
    const e = cloner(e0);
    const cle = e.journal + '|' + e.num;
    const tirage = Math.floor(alea() * 8);
    if (tirage === 0) { attendus[cle] = 'ABSENTE'; return; }
    if (tirage === 1) { // montant : variation équilibrée sur une ligne débit et la ligne crédit
      const delta = 1 + Math.floor(alea() * 10000);
      e.lignes[0].d += delta; e.lignes[e.lignes.length - 1].c += delta;
      attendus[cle] = 'MODIFIEE M_FOND';
    } else if (tirage === 2) {
      e.lignes[0].compte = e.lignes[0].compte === '6226' ? '6227' : '6226';
      attendus[cle] = 'MODIFIEE M_FOND';
    } else if (tirage === 3) {
      e.lignes[e.lignes.length - 1].let = 'L' + Math.floor(alea() * 99);
      attendus[cle] = 'MODIFIEE M_LET';
    } else if (tirage === 4) {
      e.lib = 'Libellé corrigé';
      attendus[cle] = 'MODIFIEE M_DESC';
    } else if (tirage === 5) {
      e.pieceDate = e.date;
      const jour = +e.date.slice(6);
      e.date = e.date.slice(0, 6) + String(jour > 1 ? jour - 1 : jour + 1).padStart(2, '0');
      attendus[cle] = 'MODIFIEE M_DATE';
    } else {
      attendus[cle] = 'INCHANGEE';
    }
    fichier.push(e);
  });
  const ajouts = ecrituresAleatoires(alea, 1 + Math.floor(alea() * 5), 'N');
  ajouts.forEach((e) => { attendus[e.journal + '|' + e.num] = 'NOUVELLE'; fichier.push(e); });
  return { fichier: melanger(alea, fichier), attendus };
}

function statutsObtenus(analyse) {
  return Object.fromEntries(analyse.comparaison.ecritures.map((e) => [e.journal_code + '|' + e.ecriture_num, [e.statut, ...e.sous_types].join(' ')]));
}

function sommeVariations(v) { return Object.values(v).reduce((s, x) => s + x, 0); }

test(`Comparaison : statuts obtenus = statuts construits (${ITERATIONS} jeux aléatoires)`, () => {
  for (let i = 0; i < ITERATIONS; i++) {
    const alea = prng(1000 + i);
    const { base, etat } = etatPublie(alea);
    const { fichier, attendus } = muter(alea, base);
    const a = analyser(etat, fichier);
    assert.deepEqual(statutsObtenus(a), attendus, 'graine ' + (1000 + i));
  }
});

test(`Idempotence : réimport du même contenu (ordre et fins de ligne changés) = 100 % INCHANGEE, publication sans effet (${ITERATIONS} jeux)`, () => {
  for (let i = 0; i < ITERATIONS; i++) {
    const alea = prng(2000 + i);
    const { base, etat } = etatPublie(alea);
    const a = analyser(etat, melanger(alea, base), { crlf: true });
    assert.equal(a.comparaison.compteurs.INCHANGEE, TAILLE);
    assert.equal(a.comparaison.ecritures.length, TAILLE);
    assert.deepEqual(a.anomalies, []);
    assert.deepEqual(a.variationsSoldes, {});
    const apres = publier(etat, a, 'PUB-2');
    assert.equal(checksum(apres), checksum(etat));
    assert.equal(apres.mouvements.length, etat.mouvements.length);
  }
});

test(`Idempotence : classer(publier(B, F), F) = 100 % INCHANGEE (${ITERATIONS} jeux mutés)`, () => {
  for (let i = 0; i < ITERATIONS; i++) {
    const alea = prng(3000 + i);
    const { base, etat } = etatPublie(alea);
    const { fichier } = muter(alea, base);
    const a = analyser(etat, fichier);
    const etat2 = publier(etat, a, 'PUB-2');
    const b = analyser(etat2, melanger(alea, fichier));
    const nonInchangees = b.comparaison.ecritures.filter((e) => e.statut !== 'INCHANGEE');
    assert.deepEqual(nonInchangees.map((e) => e.cle + ':' + e.statut), [], 'graine ' + (3000 + i));
  }
});

test(`Intégrité : conservation des soldes, miroir, actif publié = actif simulé (${ITERATIONS} jeux)`, () => {
  for (let i = 0; i < ITERATIONS; i++) {
    const alea = prng(4000 + i);
    const { base, etat } = etatPublie(alea);
    const { fichier } = muter(alea, base);
    const a = analyser(etat, fichier);
    assert.equal(sommeVariations(a.variationsSoldes), 0, 'Σ des variations de soldes = 0');
    const codes = a.anomalies.map((x) => x.code);
    for (const interdit of ['REC_MIROIR', 'REC_LIGNES', 'REC_TOTAUX', 'EQU_GLOBAL', 'EQU_ECRITURE']) {
      assert.ok(!codes.includes(interdit), interdit + ' inattendu, graine ' + (4000 + i));
    }
    const etat2 = publier(etat, a, 'PUB-2');
    const actives = etat2.actif.filter((l) => l.statut === 'ACTIVE');
    const d = actives.reduce((s, l) => s + l.debit_cts, 0);
    const c = actives.reduce((s, l) => s + l.credit_cts, 0);
    assert.equal(d, c, 'actif publié équilibré');
    // Chaque ligne active est traçable jusqu'à son import et sa publication.
    assert.ok(etat2.actif.every((l) => l.source_import_id && l.last_publication_id && l.ligne_uid.startsWith(l.cle_ecriture + '#')));
  }
});

test(`Retour arrière : annuler(publier(B, Δ)) = B au checksum près (${ITERATIONS} jeux)`, () => {
  for (let i = 0; i < ITERATIONS; i++) {
    const alea = prng(5000 + i);
    const { base, etat } = etatPublie(alea);
    const { fichier } = muter(alea, base);
    const a = analyser(etat, fichier);
    const etat2 = publier(etat, a, 'PUB-2');
    const u = P.annulerDernierePublication(etat2, 'ANN-1', hasher);
    assert.equal(u.ok, true, u.code);
    assert.equal(checksum(u.etat), checksum(etat), 'graine ' + (5000 + i));
    assert.deepEqual(cloner(u.etat.actif), cloner(etat.actif));
  }
});

test('Retour arrière : le premier import annulé ramène à un actif vide', () => {
  const alea = prng(42);
  const { etat } = etatPublie(alea);
  const u = P.annulerDernierePublication(etat, 'ANN-1', hasher);
  assert.equal(u.ok, true);
  assert.deepEqual(u.etat.actif, []);
});

test(`Déterminisme : mêmes entrées = mêmes sorties ; ordre des écritures sans effet sur la classification (${ITERATIONS} jeux)`, () => {
  for (let i = 0; i < ITERATIONS; i++) {
    const alea = prng(6000 + i);
    const { base, etat } = etatPublie(alea);
    const { fichier } = muter(alea, base);
    const texte = fec(fichier);
    const args = (id) => ({ etat, fichier: { texte, nomFichier: NOM_FEC, sha256: 'sha-det' }, profil: PROFIL_FEC,
      client: CLIENT, perimetre: PERIMETRE_T1, import_id: id, hasher });
    const a1 = P.analyserImport(args('I-X'));
    const a2 = P.analyserImport(args('I-X'));
    assert.deepEqual(a1, a2);
    const a3 = analyser(etat, melanger(alea, fichier));
    assert.deepEqual(statutsObtenus(a3), statutsObtenus(a1));
    assert.deepEqual(a3.variationsSoldes, a1.variationsSoldes);
    // Publications à partir des deux ordres : même actif (checksum identique).
    const e1 = publier(etat, a1, 'PUB-2');
    const e3 = publier(etat, a3, 'PUB-2');
    const sansSource = (e) => e.actif.map((l) => Object.assign({}, l, { source_rang: 0, source_import_id: '' }));
    assert.equal(Publication.checksumActif(sansSource(e1), hasher).checksum, Publication.checksumActif(sansSource(e3), hasher).checksum);
  }
});

test('Isolation : le même fichier chez deux clients produit des clés disjointes', () => {
  const alea = prng(7);
  const ecritures = ecrituresAleatoires(alea, TAILLE);
  const clientB = Object.assign(cloner(CLIENT), { client_id: 'CLI-UNIT-B' });
  const a = analyser(P.etatInitial(CLIENT.client_id), ecritures);
  const b = analyser(P.etatInitial('CLI-UNIT-B'), ecritures, { client: clientB });
  const clesA = new Set(a.comparaison.ecritures.map((e) => e.cle));
  assert.ok(b.comparaison.ecritures.every((e) => !clesA.has(e.cle)));
  assert.equal(a.comparaison.ecritures.length, b.comparaison.ecritures.length);
});
