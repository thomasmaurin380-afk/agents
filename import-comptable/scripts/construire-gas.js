'use strict';
/**
 * Assemble le paquet Apps Script du premier test fictif dans dist/gas/ — NE DÉPLOIE RIEN.
 *   node scripts/construire-gas.js
 *
 * Contenu : appsscript.json (aucune autorisation OAuth), le cœur dans l'ordre de src/core/ordre.json,
 * app/pipeline.js, l'adaptateur HasherGas, le test TestFictif et JeuxFictifs.js (S01 et S03 FICTIFS,
 * avec les résultats obtenus sous Node pour comparaison). Le déploiement (clasp push) reste une action
 * humaine, sur un projet de test, après validation : voir docs/import-comptable/plan-integration-gas.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/app/pipeline');
const hasher = require('../src/adapters/node/hasher');
const { lireFichier } = require('../src/adapters/node/fichiers');
const { choixComplets, HORO } = require('../test/aides');

const RACINE = path.join(__dirname, '..');
const SORTIE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(RACINE, 'dist', 'gas');
const FIX = path.join(RACINE, 'test', 'fixtures');
const lireJson = (rel) => JSON.parse(fs.readFileSync(path.join(FIX, rel), 'utf8'));

function jeu(rel, perimetre, profil) {
  const f = lireFichier(path.join(FIX, rel), profil.encodage);
  return { texte: f.texte, nom_fichier: f.nomFichier, sha256: f.sha256, perimetre };
}

function construire(sortie) {
  const SORTIE_EFFECTIVE = sortie ? path.resolve(sortie) : SORTIE;
  const client = lireJson('client-CLI-TEST.json');
  const profil = lireJson('profils/FEC_GENERIQUE.json');
  const s01 = jeu('scenarios/S01/123456789FEC20260331.txt', { exercice_id: '2026', du: '2026-01-01', au: '2026-03-31' }, profil);
  const s03 = jeu('scenarios/S03/123456789FEC20260430.txt', { exercice_id: '2026', du: '2026-01-01', au: '2026-04-30' }, profil);

  // Résultats de référence obtenus sous Node, à retrouver à l'identique dans Apps Script.
  function cycle(etat, j, importId, pubId) {
    const a = P.analyserImport({ etat, fichier: { texte: j.texte, nomFichier: j.nom_fichier, sha256: j.sha256 }, profil, client,
      perimetre: j.perimetre, identite: { dossier_client_id: client.client_id }, import_id: importId, horodatage: HORO.valide, hasher });
    const r = P.publier(etat, a, P.valider(etat, a, choixComplets(a), hasher), { publication_id: pubId, horodatage: HORO.valide }, hasher);
    if (!r.ok) throw new Error('référence Node : publication refusée ' + r.refus.join(','));
    return { a, r };
  }
  const c1 = cycle(P.etatInitial(client.client_id), s01, 'IMPORT-S01', 'PUB-1');
  const c2 = cycle(c1.r.etat, s03, 'IMPORT-S03', 'PUB-2');
  const u = P.annulerDernierePublication(c2.r.etat, { publication_id: 'ANN-1', horodatage: HORO.valide, tampon_inactif: c1.r.etat.actif }, hasher);
  const attendu = {
    s01_statuts: c1.a.comparaison.compteurs.par_statut,
    s03_statuts: c2.a.comparaison.compteurs.par_statut,
    s03_anomalies: c2.a.anomalies.map((x) => x.code + ':' + x.gravite),
    checksum_pub1: c1.r.publication.checksum_apres,
    checksum_pub2: c2.r.publication.checksum_apres,
    checksum_apres_annulation: u.publication.checksum_apres,
    nb_lignes_actif_pub2: c2.r.etat.actif.length
  };

  fs.rmSync(SORTIE_EFFECTIVE, { recursive: true, force: true });
  fs.mkdirSync(SORTIE_EFFECTIVE, { recursive: true });
  const ordre = JSON.parse(fs.readFileSync(path.join(RACINE, 'src', 'core', 'ordre.json'), 'utf8')).map((n) => ['src/core/' + n + '.js', n]);
  ordre.push(['src/app/pipeline.js', 'pipeline'], ['gas/HasherGas.js', 'HasherGas'], ['gas/TestFictif.js', 'TestFictif']);
  const fichiers = [];
  ordre.forEach(([src, nom], i) => {
    const cible = String(i + 1).padStart(2, '0') + '_' + nom + '.js';
    fs.copyFileSync(path.join(RACINE, src), path.join(SORTIE_EFFECTIVE, cible));
    fichiers.push(cible);
  });
  const donnees = { client, profil, s01, s03, horodatage: HORO, attendu_node: attendu, avertissement: 'DONNEES FICTIVES UNIQUEMENT' };
  const nomJeux = String(fichiers.length + 1).padStart(2, '0') + '_JeuxFictifs.js';
  fs.writeFileSync(path.join(SORTIE_EFFECTIVE, nomJeux), '/** Jeux FICTIFS S01 et S03 — généré par scripts/construire-gas.js, ne pas modifier. */\nvar JeuxFictifs = '
    + JSON.stringify(donnees, null, 1).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + ';\n');
  fichiers.push(nomJeux);
  fs.copyFileSync(path.join(RACINE, 'gas', 'appsscript.json'), path.join(SORTIE_EFFECTIVE, 'appsscript.json'));
  // Modèle de configuration clasp : l'identifiant du projet de TEST est à renseigner localement, jamais dans Git.
  fs.writeFileSync(path.join(SORTIE_EFFECTIVE, '.clasp.json.exemple'), JSON.stringify({
    scriptId: 'A_RENSEIGNER_PROJET_DE_TEST_UNIQUEMENT', rootDir: '.', filePushOrder: fichiers
  }, null, 2) + '\n');
  // Fichier unique à copier-coller dans l'éditeur Apps Script (palier G0) : mêmes fichiers, même contenu,
  // concaténés. Le test est placé en tête pour que `testPrototypeFictif` soit la fonction proposée par défaut ;
  // le cœur et les données sont ensuite chargés dans l'ordre de ordre.json (exécution séquentielle du fichier).
  const enTete = [
    '/**',
    ' * TEST G0 - IMPORT COMPTABLE - FICHIER UNIQUE (DONNEES FICTIVES UNIQUEMENT)',
    ' *',
    ' * Mode d\'emploi : coller ce fichier en entier dans un projet Google Apps Script vide,',
    ' * enregistrer, choisir la fonction testPrototypeFictif, cliquer sur Executer.',
    ' * Le resultat s\'affiche dans le journal d\'execution : RESULTAT G0 : REUSSI ou ECHEC.',
    ' *',
    ' * Ce code ne lit ni n\'ecrit aucun classeur, aucun fichier Drive, aucun e-mail ;',
    ' * il n\'appelle aucun service externe et ne demande aucune autorisation.',
    ' * Genere automatiquement par scripts/construire-gas.js - ne pas modifier a la main.',
    ' */',
    ''
  ].join('\n');
  const ordreUnique = ['TestFictif', 'HasherGas'].map((n) => fichiers.find((f) => f.endsWith('_' + n + '.js')))
    .concat(fichiers.filter((f) => !/_(TestFictif|HasherGas)\.js$/.test(f)));
  const corps = ordreUnique.map((f) => '// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(SORTIE_EFFECTIVE, f), 'utf8').trimEnd() + '\n').join('\n');
  const unique = enTete + corps;
  fs.writeFileSync(path.join(SORTIE_EFFECTIVE, 'G0_fichier_unique.gs'), unique);
  return { sortie: SORTIE_EFFECTIVE, fichiers, attendu, fichierUnique: 'G0_fichier_unique.gs' };
}

if (require.main === module) {
  const r = construire();
  console.log(`Paquet Apps Script assemblé dans ${path.relative(RACINE, r.sortie)} (${r.fichiers.length} fichiers + appsscript.json), `
    + `et fichier unique ${r.fichierUnique}. Rien n'a été déployé.`);
}

module.exports = { construire };
