'use strict';
/**
 * Règles d'architecture : le cœur et les cas d'usage restent portables (Apps Script, future application).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hasher = require('../src/adapters/node/hasher');
const { CLIENT, PROFIL_FEC, PERIMETRE_T1, NOM_FEC, fec, prng, ecrituresAleatoires } = require('./aides');

const RACINE = path.join(__dirname, '..', 'src');
// Ordre de chargement Apps Script (équivalent du filePushOrder de clasp).
const ORDRE = ['core/modele.js', 'core/normalisation.js', 'core/csv.js', 'core/anomalies.js', 'core/identite.js',
  'core/profil.js', 'core/lecture.js', 'core/comparaison.js', 'core/controles.js', 'core/publication.js', 'app/pipeline.js'];

function sources() {
  return ['core', 'app'].flatMap((d) => fs.readdirSync(path.join(RACINE, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f));
}

test('Aucune API Google ni Node dans src/core et src/app', () => {
  const interdits = /\b(SpreadsheetApp|DriveApp|Utilities|LockService|ScriptApp|PropertiesService|UrlFetchApp|HtmlService|Session|process|Buffer|__dirname|setTimeout|fetch)\b|require\(['"](node:|fs|path|crypto|http)/;
  for (const f of sources()) {
    const code = fs.readFileSync(path.join(RACINE, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const m = interdits.exec(code);
    assert.equal(m, null, `${f} utilise ${m && m[0]}`);
  }
});

test('Déterminisme et syntaxe ES2019 (compatibilité Apps Script V8) dans src/core et src/app', () => {
  const interdits = [
    [/\bnew Date\b|\bDate\.now\b|\bMath\.random\b|\blocaleCompare\b|\bIntl\.|\btoLocale\w*\(|\bconsole\./, 'source non déterministe ou journalisation'],
    [/\?\.|\?\?|\.at\(|replaceAll|Object\.hasOwn|structuredClone|\bBigInt\b|^\s*(import|export)\s|#[a-z]\w*\s*[=;(]/m, 'syntaxe postérieure à ES2019'],
    [/\blet\b|\bconst\b|=>/, 'syntaxe ES2015+ évitée dans le cœur (style var/function homogène)']
  ];
  for (const f of sources()) {
    const code = fs.readFileSync(path.join(RACINE, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const [motif, raison] of interdits) {
      const m = motif.exec(code);
      assert.equal(m, null, `${f} : ${raison} (${m && m[0]})`);
    }
    const requires = code.match(/require\(['"][^'"]+['"]\)/g) || [];
    requires.forEach((r) => assert.match(r, /require\('\.\.?\/(core\/)?[a-z]+'\)/, `${f} : require non relatif ${r}`));
  }
});

test('Tous les fichiers du cœur figurent dans l\'ordre de chargement Apps Script', () => {
  assert.deepEqual(sources().sort(), ORDRE.slice().sort());
});

test('Le cœur se charge sans require ni module (simulation de la portée globale Apps Script) et produit le même résultat', () => {
  const contexte = vm.createContext({});
  for (const f of ORDRE) vm.runInContext(fs.readFileSync(path.join(RACINE, f), 'utf8'), contexte, { filename: f });
  assert.equal(typeof contexte.Pipeline.analyserImport, 'function');

  const texte = fec(ecrituresAleatoires(prng(99), 20));
  const entree = (P) => ({ etat: P.etatInitial(CLIENT.client_id), fichier: { texte, nomFichier: NOM_FEC, sha256: 's' },
    profil: PROFIL_FEC, client: CLIENT, perimetre: PERIMETRE_T1, import_id: 'I', hasher });
  const gas = contexte.Pipeline.analyserImport(entree(contexte.Pipeline));
  const node = require('../src/app/pipeline').analyserImport(entree(require('../src/app/pipeline')));
  assert.equal(JSON.stringify(gas), JSON.stringify(node));
});
