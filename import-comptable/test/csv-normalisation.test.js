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
  assert.deepEqual(N.parseMontant('12.5', ','), { ok: false, code: 'MNT_FORMAT' }); // point ambigu en mode virgule
  assert.deepEqual(N.parseMontant('1.23,4', ','), { ok: false, code: 'MNT_FORMAT' });
  assert.deepEqual(N.parseMontant('1,234', ','), { ok: false, code: 'MNT_PRECISION' });
  assert.deepEqual(N.parseMontant('abc', ','), { ok: false, code: 'MNT_FORMAT' });
  assert.deepEqual(N.parseMontant('1,2,3', ','), { ok: false, code: 'MNT_FORMAT' });
  assert.deepEqual(N.parseMontant('-', ','), { ok: false, code: 'MNT_FORMAT' });
});

test('Dates : formats imposés, calendrier vérifié', () => {
  assert.deepEqual(N.parseDate('20240229', 'AAAAMMJJ'), { ok: true, iso: '2024-02-29', vide: false });
  assert.deepEqual(N.parseDate('20260229', 'AAAAMMJJ'), { ok: false, code: 'DATE_INEXISTANTE' });
  assert.deepEqual(N.parseDate('31/02/2026', 'JJ/MM/AAAA'), { ok: false, code: 'DATE_INEXISTANTE' });
  assert.deepEqual(N.parseDate('05/03/2026', 'JJ/MM/AAAA').iso, '2026-03-05');
  assert.deepEqual(N.parseDate('2026-03-05', 'AAAA-MM-JJ').iso, '2026-03-05');
  assert.deepEqual(N.parseDate('05/03/26', 'JJ/MM/AAAA'), { ok: false, code: 'DATE_FORMAT' });
  assert.deepEqual(N.parseDate('', 'AAAAMMJJ'), { ok: true, iso: '', vide: true });
  assert.deepEqual(N.parseDate('21000229', 'AAAAMMJJ'), { ok: false, code: 'DATE_INEXISTANTE' });
});

test('Comptes : padding à droite, jamais de troncature', () => {
  assert.deepEqual(N.normCompte('6061', 8), { ok: true, compte: '60610000', vide: false });
  assert.deepEqual(N.normCompte(' 401.1-0 ', 8).compte, '40110000');
  assert.deepEqual(N.normCompte('123456789012', 8), { ok: false, code: 'CPT_LONGUEUR' });
  assert.deepEqual(N.normCompte('401DUPONT', 8), { ok: false, code: 'CPT_NON_NUMERIQUE' });
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
    assert.equal(N.neutraliser(s), "'" + s);
  }
  assert.equal(N.doitEtreNeutralise('Loyer'), false);
  assert.equal(N.neutraliser('Loyer'), 'Loyer');
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
