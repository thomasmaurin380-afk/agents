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
  assert.match(jeux, /DONNÉES FICTIVES UNIQUEMENT/);
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
  assert.equal(journal.length, 1);
  assert.equal(/Dupont|Facture|Loyer/.test(journal[0]), false, 'aucune donnée comptable dans le journal');
  assert.equal(r.attendu.checksum_apres_annulation, r.attendu.checksum_pub1);
  // Un Hasher qui oublierait la conversion des octets signés est rejeté.
  vm.runInContext('HasherGas.sha256Hex = function (t) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8).map(function (b) { return b.toString(16); }).join(""); }', contexte);
  assert.throws(() => vm.runInContext('testPrototypeFictif()', contexte), /HASHER_INVALIDE/);
  fs.rmSync(dossier, { recursive: true, force: true });
});
