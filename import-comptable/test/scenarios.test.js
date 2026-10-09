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
