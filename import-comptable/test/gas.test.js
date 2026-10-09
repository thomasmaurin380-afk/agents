'use strict';
/**
 * Paquet Apps Script du premier test fictif : assemblage et exécution dans un environnement Apps Script SIMULÉ
 * (vm Node, Utilities.computeDigest imité avec des octets signés). Ne remplace pas l'exécution réelle (spikes SP2, SP12).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { construire } = require('../scripts/construire-gas');

function utilitiesSimule() {
  return {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algo, texte, charset) {
      assert.equal(algo, 'SHA_256'); assert.equal(charset, 'UTF_8');
      // Apps Script renvoie un tableau d'octets SIGNÉS (-128..127).
      return Array.from(crypto.createHash('sha256').update(String(texte), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b));
    }
  };
}

test('Paquet Apps Script : assemblé dans l\'ordre, aucune autorisation, aucun accès aux données ni au réseau', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-'));
  const r = construire(dossier);
  const manifeste = JSON.parse(fs.readFileSync(path.join(dossier, 'appsscript.json'), 'utf8'));
  assert.deepEqual(manifeste.oauthScopes, []);
  assert.equal(manifeste.runtimeVersion, 'V8');
  const clasp = JSON.parse(fs.readFileSync(path.join(dossier, '.clasp.json.exemple'), 'utf8'));
  assert.deepEqual(clasp.filePushOrder, r.fichiers);
  assert.match(clasp.scriptId, /^A_RENSEIGNER/);
  for (const f of r.fichiers) {
    const code = fs.readFileSync(path.join(dossier, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.equal(/SpreadsheetApp|DriveApp|DocumentApp|UrlFetchApp|PropertiesService|ScriptApp|GmailApp|Session\./.test(code), false, f);
  }
  const jeux = fs.readFileSync(path.join(dossier, r.fichiers[r.fichiers.length - 1]), 'utf8');
  assert.match(jeux, /DONNEES FICTIVES UNIQUEMENT/);
  assert.match(jeux, /CLI-TEST/);
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('Paquet Apps Script : exécution simulée de testPrototypeFictif identique aux résultats Node', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-'));
  const r = construire(dossier);
  const journal = [];
  const contexte = vm.createContext({ Utilities: utilitiesSimule(), Logger: { log: (s) => journal.push(s) }, JSON, Date, Math });
  for (const f of r.fichiers) vm.runInContext(fs.readFileSync(path.join(dossier, f), 'utf8'), contexte, { filename: f });
  const resultat = vm.runInContext('testPrototypeFictif()', contexte);
  // Objets créés dans un autre « realm » (vm) : comparaison des valeurs sérialisées.
  assert.equal(JSON.stringify(resultat.ecarts), '[]');
  assert.equal(resultat.ok, true);
  assert.equal(journal.length, 2);
  assert.match(journal[0], /^RESULTAT G0 : REUSSI/);
  assert.equal(/Dupont|Facture|Loyer/.test(journal.join('\n')), false, 'aucune donnée comptable dans le journal');
  assert.equal(r.attendu.checksum_apres_annulation, r.attendu.checksum_pub1);
  // Un Hasher qui oublierait la conversion des octets signés est rejeté.
  vm.runInContext('HasherGas.sha256Hex = function (t) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8).map(function (b) { return b.toString(16); }).join(""); }', contexte);
  assert.throws(() => vm.runInContext('testPrototypeFictif()', contexte), /HASHER_INVALIDE/);
  fs.rmSync(dossier, { recursive: true, force: true });
});

test('Fichier unique G0 (copier-coller) : à jour, sans dépendance, résultats identiques aux tests existants', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-'));
  const r = construire(dossier);
  const genere = fs.readFileSync(path.join(dossier, r.fichierUnique), 'utf8');
  const versionne = fs.readFileSync(path.join(__dirname, '..', 'gas', 'G0_fichier_unique.gs'), 'utf8');
  assert.equal(versionne, genere, 'gas/G0_fichier_unique.gs doit être régénéré (node scripts/construire-gas.js)');
  // Aucun accès aux données Google ni au réseau, aucune dépendance Node.
  const code = genere.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.equal(/SpreadsheetApp|DriveApp|DocumentApp|GmailApp|UrlFetchApp|PropertiesService|ScriptApp|Session\./.test(code), false);
  // Les données fictives embarquées sont en ASCII strict (robustes au copier-coller).
  const donnees = genere.slice(genere.indexOf('var JeuxFictifs = '));
  assert.equal(/[^\x09\x0a\x0d\x20-\x7e]/.test(donnees), false);
  // La fonction proposée par défaut dans l'éditeur est la première déclarée : testPrototypeFictif.
  assert.equal(/^function (\w+)/m.exec(genere)[1], 'testPrototypeFictif');

  // Exécution dans un Apps Script simulé : un seul fichier, aucune variable globale fournie hors Utilities et Logger.
  const journal = [];
  const contexte = vm.createContext({ Utilities: utilitiesSimule(), Logger: { log: (x) => journal.push(x) } });
  vm.runInContext(genere, contexte, { filename: 'G0_fichier_unique.gs' });
  const res = JSON.parse(JSON.stringify(vm.runInContext('testPrototypeFictif()', contexte)));
  assert.equal(res.ok, true, JSON.stringify(res.ecarts));
  assert.match(journal[0], /^RESULTAT G0 : REUSSI/);

  // Mêmes résultats que les tests existants : attendus de l'ingénieur (S01, S03) et moteur sous Node.
  const fix = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'attendus', n), 'utf8')).attendu;
  const s01 = fix('S01.json'), s03 = fix('S03.json');
  const obtenu = JSON.parse(JSON.stringify(vm.runInContext(`(function () {
    var J = JeuxFictifs, H = HasherGas;
    var e0 = Pipeline.etatInitial(J.client.client_id);
    function analyser(etat, jeu, id) { return Pipeline.analyserImport({ etat: etat, fichier: { texte: jeu.texte, nomFichier: jeu.nom_fichier, sha256: jeu.sha256 },
      profil: J.profil, client: J.client, perimetre: jeu.perimetre, identite: { dossier_client_id: J.client.client_id }, import_id: id, horodatage: J.horodatage.valide, hasher: H }); }
    var a1 = analyser(e0, J.s01, 'IMPORT-S01');
    var p1 = Pipeline.publier(e0, a1, Pipeline.valider(e0, a1, choixTest(a1), H), { publication_id: 'PUB-1' }, H);
    var a3 = analyser(p1.etat, J.s03, 'IMPORT-S03');
    return { s01: a1.comparaison.compteurs, s03: a3.comparaison.compteurs, anomalies: a3.anomalies.map(function (x) { return x.code + ':' + x.gravite; }).sort(),
      totaux03: a3.lecture.totaux, ecritures03: a3.comparaison.ecritures.filter(function (x) { return x.bloc <= 1; })
        .map(function (x) { return [x.journal_code + '|' + x.ecriture_num, x.statut, x.sous_types.join(',')]; }) };
  })()`, contexte)));
  for (const [k, v] of Object.entries(s01.statuts)) assert.equal(obtenu.s01.par_statut[k], v, 'S01 ' + k);
  for (const [k, v] of Object.entries(s03.statuts)) assert.equal(obtenu.s03.par_statut[k], v, 'S03 ' + k);
  assert.deepEqual(obtenu.s03.par_sous_type, s03.sous_types);
  assert.deepEqual(obtenu.totaux03, s03.totaux_fichier);
  assert.deepEqual(obtenu.anomalies.filter((x) => !x.endsWith(':I')), s03.anomalies.map((x) => x.code + ':' + x.gravite).sort());
  for (const [cle, e] of Object.entries(s03.ecritures)) {
    const ligne = obtenu.ecritures03.find((x) => x[0] === cle);
    assert.ok(ligne, cle);
    assert.equal(ligne[1], e.statut, cle);
    if (e.sous_types) assert.equal(ligne[2], e.sous_types.join(','), cle);
  }
  assert.deepEqual(res.journal, JSON.parse(JSON.stringify(res.journal)));
  fs.rmSync(dossier, { recursive: true, force: true });
});
