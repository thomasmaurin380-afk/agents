'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Csv = require('../src/core/csv');
const N = require('../src/core/normalisation');

test('CSV : guillemets, séparateur et retour à la ligne dans un champ, CRLF, ligne vide, BOM', () => {
  const r = Csv.parseCsv('\uFEFFa;b\r\n1;"x;""y""\nz"\r\n\r\n3;4', { separateur: ';' });
  assert.equal(r.bom, true);
  assert.deepEqual(r.entete, ['a', 'b']);
  assert.equal(r.enregistrements.length, 3);
  assert.deepEqual(r.enregistrements[0].champs, ['1', 'x;"y"\nz']);
  assert.equal(r.enregistrements[0].rang, 2);
  assert.equal(r.enregistrements[0].ligneFin, 3);
  assert.equal(r.enregistrements[1].vide, true);
  assert.deepEqual(r.enregistrements[2].champs, ['3', '4']);
  assert.equal(r.lignesPhysiques, 5);
});

test('CSV : guillemet non fermé signalé', () => {
  const r = Csv.parseCsv('a;b\n1;"abc\n', { separateur: ';' });
  assert.deepEqual(r.erreurs, [{ rang: 2, code: 'GUILLEMET_NON_FERME' }]);
});

test('CSV : sans fin de ligne finale, et fichier vide', () => {
  assert.equal(Csv.parseCsv('a\tb\n1\t2', { separateur: '\t' }).enregistrements.length, 1);
  const vide = Csv.parseCsv('', { separateur: ';' });
  assert.deepEqual(vide.entete, []);
  assert.equal(vide.enregistrements.length, 0);
});

test('Montants : formats admis, en centimes entiers', () => {
  const cas = [
    ['1 234,56', 123456], ['1\u00A0234,56', 123456], ['1\u202F234,56', 123456], ['(1.234,56)', -123456],
    ['1234,5', 123450], ['12,00-', -1200], ['-12,00', -1200], ['+12', 1200], ['0,5', 50], [',5', 50],
    ['1.234.567,89', 123456789], ['-0,00', 0], ['0', 0], ['', 0]
  ];
  for (const [s, cts] of cas) {
    const r = N.parseMontant(s, ',');
    assert.equal(r.ok, true, s);
    assert.equal(r.cts, cts, s);
    assert.ok(!Object.is(r.cts, -0), 'pas de -0 pour ' + s);
  }
  assert.equal(N.parseMontant('1,234.56', '.').cts, 123456);
});

test('Montants : rejets explicites, jamais d\'interprétation silencieuse', () => {
  assert.deepEqual(N.parseMontant('12.5', ','), { ok: false, motif: 'MONTANT' }); // point ambigu en mode virgule
  assert.deepEqual(N.parseMontant('1.23,4', ','), { ok: false, motif: 'MONTANT' });
  assert.deepEqual(N.parseMontant('1,234', ','), { ok: false, motif: 'PRECISION' });
  assert.deepEqual(N.parseMontant('1,2301', ','), { ok: false, motif: 'PRECISION' }, 'P7 : une décimale non nulle au-delà de 2 reste rejetée');
  assert.deepEqual(N.parseMontant('(-12,00)', ','), { ok: false, motif: 'MONTANT' }, 'double marqueur négatif');
  assert.deepEqual(N.parseMontant('abc', ','), { ok: false, motif: 'MONTANT' });
  assert.deepEqual(N.parseMontant('1,2,3', ','), { ok: false, motif: 'MONTANT' });
  assert.deepEqual(N.parseMontant('-', ','), { ok: false, motif: 'MONTANT' });
});

test('Dates : formats imposés, calendrier vérifié', () => {
  assert.deepEqual(N.parseDate('20240229', 'AAAAMMJJ'), { ok: true, iso: '2024-02-29', vide: false });
  assert.deepEqual(N.parseDate('20260229', 'AAAAMMJJ'), { ok: false, motif: 'DATE' });
  assert.deepEqual(N.parseDate('31/02/2026', 'JJ/MM/AAAA'), { ok: false, motif: 'DATE' });
  assert.deepEqual(N.parseDate('05/03/2026', 'JJ/MM/AAAA').iso, '2026-03-05');
  assert.deepEqual(N.parseDate('2026-03-05', 'AAAA-MM-JJ').iso, '2026-03-05');
  assert.deepEqual(N.parseDate('05/03/26', 'JJ/MM/AAAA'), { ok: false, motif: 'DATE' });
  assert.deepEqual(N.parseDate('', 'AAAAMMJJ'), { ok: true, iso: '', vide: true });
  assert.deepEqual(N.parseDate('21000229', 'AAAAMMJJ'), { ok: false, motif: 'DATE' });
});

test('Comptes : padding à droite, jamais de troncature', () => {
  assert.deepEqual(N.normCompte('6061', 8), { ok: true, compte: '60610000', source: '6061', compact: '6061', vide: false });
  assert.deepEqual(N.normCompte(' 401.1-0 ', 8).compte, '40110000');
  assert.deepEqual(N.normCompte('123456789012', 8), { ok: false, motif: 'COMPTE_LONG' });
  assert.deepEqual(N.normCompte('401DUPONT', 8), { ok: false, motif: 'COMPTE_NON_NUM' });
  assert.equal(N.normAuxiliaire(' 0012 '), '0012');
});

test('Texte : NFC, espaces insécables, contrôles, casse conservée', () => {
  assert.equal(N.normTexte('  Loyer\u00A0\u00A0mars\t2026 '), 'Loyer mars 2026');
  assert.equal(N.normTexte('électricité'), 'électricité');
  assert.equal(N.normCode(' ac '), 'AC');
});

test('Encodage : caractère de remplacement et double encodage détectés', () => {
  assert.deepEqual(N.verifierEncodage('Électricité'), []);
  assert.deepEqual(N.verifierEncodage('Facture �lectricit�'), ['CARACTERE_REMPLACEMENT']);
  const double = Buffer.from('Électricité à régler', 'utf8').toString('latin1');
  assert.deepEqual(N.verifierEncodage(double), ['DOUBLE_ENCODAGE']);
});

test('Neutralisation des formules : signalée, valeur canonique inchangée', () => {
  for (const s of ['=1+1', '+33', '-x', '@SOMME', '=IMPORTRANGE("x","y")']) {
    assert.equal(N.doitEtreNeutralise(s), true, s);
    assert.deepEqual(N.neutraliser(s), { valeur: "'" + s, neutralise: true });
  }
  assert.equal(N.doitEtreNeutralise('Loyer'), false);
  assert.deepEqual(N.neutraliser('Loyer'), { valeur: 'Loyer', neutralise: false });
});

test('Adaptateur Node : windows-1252 décodé selon la norme (€, —, guillemets) ; positions non définies = U+FFFD', () => {
  const { decoder } = require('../src/adapters/node/fichiers');
  assert.equal(decoder(Buffer.from([0x80, 0x97, 0x92, 0xE9, 0xC9, 0x41]), 'windows-1252'), '\u20AC\u2014\u2019\u00E9\u00C9A');
  assert.equal(decoder(Buffer.from([0x81]), 'windows-1252'), '\uFFFD');
  assert.equal(decoder(Buffer.from('\uFEFFÉté', 'utf8'), 'UTF-8'), '\uFEFFÉté');
  // Constat documenté : le TextDecoder de Node 22 ne respecte pas windows-1252 pour 0x80–0x9F.
  const natif = new TextDecoder('windows-1252').decode(Buffer.from([0x80]));
  assert.ok(natif === '\u20AC' || natif === '\u0080', 'comportement natif inattendu : ' + JSON.stringify(natif));
});

test('Montants (P7) : décimales supplémentaires nulles acceptées après validation stricte, sans arrondi', () => {
  for (const [s, cts] of [['1,230', 123], ['1 234,5600', 123456], ['(12,000)', -1200], ['0,000', 0]]) {
    const r = N.parseMontant(s, ',');
    assert.equal(r.ok, true, s);
    assert.equal(r.cts, cts, s);
    assert.equal(r.decimalesNulles, true, s);
  }
  assert.equal(N.parseMontant('1,23', ',').decimalesNulles, false);
  assert.deepEqual(N.parseMontant('1,235', ','), { ok: false, motif: 'PRECISION' });
  assert.deepEqual(N.parseMontant('1,2350', ','), { ok: false, motif: 'PRECISION' });
  assert.deepEqual(N.parseMontant('1,', ','), { ok: false, motif: 'MONTANT' });
});

test('Hasher : vecteurs de référence calculés hors Node (sha256sum, Python) ; Hasher invalide refusé', () => {
  const E = require('../src/core/empreinte');
  const hasher = require('../src/adapters/node/hasher');
  assert.equal(E.verifierHasher(hasher), true);
  assert.equal(hasher.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const faux = [null, {}, { sha256Hex: () => 'abc' }, { sha256Hex: (s) => hasher.sha256Hex(s).toUpperCase() },
    { sha256Hex: (s) => require('node:crypto').createHash('sha256').update(s, 'latin1').digest('hex') }];
  for (const h of faux) assert.throws(() => E.verifierHasher(h), { name: 'ErreurContrat', code: 'HASHER_INVALIDE' });
  // Le pipeline refuse un Hasher invalide avant tout traitement.
  const P = require('../src/app/pipeline');
  const { CLIENT, PROFIL_FEC, PERIMETRE_T1 } = require('./aides');
  assert.throws(() => P.analyserImport({ etat: P.etatInitial(CLIENT.client_id), fichier: { texte: '', nomFichier: 'x', sha256: 'x' },
    profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, import_id: 'I', hasher: faux[4] }), { code: 'HASHER_INVALIDE' });
});

test('Sérialisation des empreintes : format du contrat, séparateur interdit dans les valeurs', () => {
  const E = require('../src/core/empreinte');
  const hasher = require('../src/adapters/node/hasher');
  assert.equal(E.serialiser('h_fond', ['40100000', '0012', 0, 60000, '', null]), 'v1:h_fond\u001F40100000\u001F0012\u001F0\u001F60000\u001F\u001F');
  // Valeur calculée indépendamment : printf 'v1:h_fond\x1f40100000\x1f0012\x1f0\x1f60000\x1f\x1f' | sha256sum
  assert.equal(E.H('h_fond', ['40100000', '0012', 0, 60000, '', null], hasher), 'v1:590e64e18514f9abad5e65c214f32869c8078e1ebaa856cef0ce245c9af6b7d3');
  assert.equal(E.serialiser('x', [true, false]), 'v1:x\u001F1\u001F0');
  for (const v of ['a\u001Fb', 1.5, {}, NaN]) assert.throws(() => E.H('x', [v], hasher), { code: 'SERIALISATION_INVALIDE' });
  assert.equal(E.Coll('c', ['b', 'a'], hasher, true), E.H('c', ['2', 'a', 'b'], hasher));
});

test('Lecture (P3) : un montant négatif reste dans sa colonne, sans reclassement', () => {
  const L = require('../src/core/lecture');
  const { CLIENT, PROFIL_FEC, PERIMETRE_T1, ENTETE_FEC } = require('./aides');
  const ligne = (d, c) => ['OD', 'OD', '1', '20260115', '471', '', '', '', 'P1', '20260115', 'Extourne', d, c, '', '', '', '', ''].join('\t');
  const texte = [ENTETE_FEC.join('\t'), ligne('-25,00', ''), ligne('', '-25,00')].join('\n') + '\n';
  const r = L.normaliserFichier({ texte, nomFichier: 'x', profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, import_id: 'I', file_sha256: 's' });
  assert.deepEqual(r.lignes.map((l) => [l.debit_cts, l.credit_cts, l.montant_cts]), [[-2500, 0, -2500], [0, -2500, 2500]]);
  assert.deepEqual(r.infos.montants_negatifs, [2, 3]);
  assert.deepEqual(r.totaux, { debit_cts: -2500, credit_cts: -2500 });
  // Débit et crédit vides ensemble : rejet CHP_VIDE (contrat) ; montant devise absent = null.
  const vide = L.normaliserFichier({ texte: [ENTETE_FEC.join('\t'), ligne('', ''), ligne('1,00', '')].join('\n'), nomFichier: 'x',
    profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, import_id: 'I', file_sha256: 's' });
  assert.deepEqual(vide.rejets, [{ rang: 2, motif: 'CHP_VIDE', champ: 'debit' }]);
  assert.equal(vide.lignes[0].montant_devise_cts, null);
});
