'use strict';
/**
 * Exécute les scénarios fictifs de l'ingénieur outils financiers et compare le moteur aux résultats
 * attendus établis indépendamment du code (voir scenarios-lib.js pour les conventions de rapprochement).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { scenarios, executer, comparer } = require('./scenarios-lib');

for (const scenario of scenarios) {
  test(`Scénario ${scenario.id} — ${scenario.description.replace(/^FICTIF — /, '').slice(0, 90)}`, () => {
    assert.deepEqual(comparer(scenario, executer(scenario)), []);
  });
}

test('Empreintes de référence (contrat §5) : égalité exacte avec une implémentation Python indépendante, sur S01', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const Identite = require('../src/core/identite');
  const { hasher } = require('./aides');
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'attendus', 'S01_empreintes_reference.json'), 'utf8'));
  const s01 = scenarios.find((s) => s.id === 'S01');
  const a = executer(s01).analyse;
  const parRang = Object.fromEntries(a.lecture.lignes.map((l) => [l.source_rang, l]));
  assert.equal(ref.lignes.length, a.lecture.lignes.length);
  for (const r of ref.lignes) {
    const h = Identite.empreintes(parRang[r.rang], hasher);
    assert.deepEqual(h, { h_fond: r.h_fond, h_desc: r.h_desc, h_let: r.h_let }, 'rang ' + r.rang);
  }
  for (const ec of a.comparaison.ecritures) {
    assert.equal(ec.h_ecr, ref.h_ecr[ec.cle.split('|').slice(2).join('|')], ec.cle);
  }
});
