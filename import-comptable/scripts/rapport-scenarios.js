'use strict';
/**
 * Tableau de synthèse des scénarios fictifs (Markdown) : attendu vs obtenu.
 *   node scripts/rapport-scenarios.js
 */
const { scenarios, executer, comparer } = require('../test/scenarios-lib');

const lignes = ['| Scénario | Résultat | Statut import | Lignes lues / importées / rejetées / doublons | Statuts obtenus | Anomalies A/B/BND obtenues | Écarts |',
  '|---|---|---|---|---|---|---|'];
for (const s of scenarios) {
  const r = executer(s);
  const a = r.analyse;
  const ecarts = comparer(s, r);
  const c = a.lecture ? a.lecture.compteurs : null;
  const comp = a.comparaison;
  const statuts = comp ? Object.entries(comp.compteurs.par_statut).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') : '—';
  const anos = a.anomalies.filter((x) => x.gravite !== 'I').map((x) => `${x.code} (${x.gravite})`).join(', ') || '—';
  const cpt = c && comp ? `${c.lues} / ${comp.compteurs.lignes_retenues} / ${c.rejetees} / ${comp.compteurs.lignes_doublons_ignorees}` : (c ? `${c.lues} / 0 / ${c.rejetees} / 0` : 'non lu');
  lignes.push(`| ${s.id} | ${ecarts.length ? '**ÉCART**' : 'conforme'} | ${a.statut}${a.rejete ? ' (bloqué)' : ''} | ${cpt} | ${statuts} | ${anos} | ${ecarts.length ? ecarts.join(' ; ') : '0'} |`);
}
console.log(lignes.join('\n'));
