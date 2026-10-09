'use strict';
/**
 * Bibliothèque d'exécution des scénarios fictifs de l'ingénieur outils financiers (test/fixtures) et compare le moteur
 * aux résultats attendus, établis indépendamment du code (test/fixtures/attendus/*.json).
 *
 * Conventions de rapprochement (voir docs/import-comptable/resultats-tests.md) :
 * - rang = n° de ligne physique (en-tête = ligne 1), dans le moteur comme dans les attendus (E18) ;
 * - montant devise absent = null (E7) ;
 * - infos « M_DESC » / « M_LET » des attendus = codes IDN_MOD_DESC / IDN_MOD_LET du moteur ;
 * - identité du client confirmée par le dossier de dépôt (ce que fournira l'adaptateur Drive, P6).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/app/pipeline');
const Publication = require('../src/core/publication');
const Controles = require('../src/core/controles');
const { lireFichier } = require('../src/adapters/node/fichiers');
const { hasher, choixComplets, variationsEnTable } = require('./aides');

const FIX = path.join(__dirname, 'fixtures');
const lire = (rel) => JSON.parse(fs.readFileSync(path.join(FIX, rel), 'utf8'));

function analyser(etat, spec, clientRel, importId) {
  const client = lire(clientRel);
  const profil = lire(spec.profil);
  const f = lireFichier(path.join(FIX, spec.fichier), profil.encodage);
  return {
    client,
    analyse: P.analyserImport({
      etat, fichier: { texte: f.texte, nomFichier: f.nomFichier, sha256: f.sha256 }, profil, client,
      perimetre: spec.perimetre, totalSaisi: spec.total_saisi, identite: { dossier_client_id: client.client_id }, import_id: importId, hasher
    })
  };
}

/** Rejoue un scénario : publie la base, puis analyse le fichier du scénario. */
function executer(scenario) {
  let etat = P.etatInitial(lire(scenario.client).client_id);
  scenario.base.forEach((b, i) => {
    const { analyse } = analyser(etat, b, b.client || scenario.client, 'BASE-' + (i + 1));
    assert.equal(analyse.rejete, false, `base ${b.fichier} rejetée : ${analyse.anomalies.map((a) => a.code)}`);
    const validee = P.valider(etat, analyse, choixComplets(analyse), hasher);
    const r = P.publier(etat, analyse, validee, { publication_id: 'PUB-BASE-' + (i + 1) }, hasher);
    assert.equal(r.ok, true, JSON.stringify(r.refus));
    etat = r.etat;
  });
  const spec = Object.assign({}, scenario, { total_saisi: scenario.attendu.total_saisi });
  return Object.assign({ etat }, analyser(etat, spec, scenario.client, 'IMPORT-' + scenario.id));
}

const court = (cle) => cle.split('|').slice(2).join('|');
const somme = (lignes) => lignes.reduce((t, l) => ({ debit_cts: t.debit_cts + l.debit_cts, credit_cts: t.credit_cts + l.credit_cts }), { debit_cts: 0, credit_cts: 0 });

function objetComparable(objet) {
  if (typeof objet !== 'string') return null;
  if (/^[A-Z]+\|[^ ]+$/.test(objet)) return { type: 'ECRITURE', cle: objet };
  if (/^\d{8}$/.test(objet)) return { type: 'COMPTE', cle: objet };
  return null;
}

/** Compare un scénario ; renvoie la liste des écarts (vide = conforme). */
function comparer(scenario, res) {
  const att = scenario.attendu;
  const a = res.analyse;
  const ecarts = [];
  const verifier = (libelle, obtenu, attendu) => {
    try { assert.deepStrictEqual(obtenu, attendu); } catch (e) { ecarts.push(`${libelle} : obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`); }
  };

  verifier('rejete', a.rejete, att.rejete);
  if (att.statut_import) verifier('statut', a.statut, att.statut_import);

  if (att.compteurs_lignes) {
    const c = a.lecture.compteurs;
    const comp = a.comparaison ? a.comparaison.compteurs : { lignes_retenues: 0, lignes_doublons_ignorees: 0 };
    verifier('compteurs_lignes', {
      lues: c.lues, importees: comp.lignes_retenues, rejetees: c.rejetees, vides: c.vides,
      doublons_ignores: comp.lignes_doublons_ignorees
    }, att.compteurs_lignes);
  } else {
    // Import arrêté avant l'interprétation des lignes : aucune ligne normalisée, aucune comparaison.
    verifier('aucune ligne interprétée', a.lecture ? a.lecture.lignes.length : 0, 0);
    verifier('aucune comparaison', a.comparaison, null);
  }
  if (att.totaux) verifier('totaux (lignes importées)', somme(a.comparaison ? a.comparaison.lignesRetenues : a.lecture.lignes), att.totaux);
  if (att.totaux_fichier) verifier('totaux_fichier', a.lecture.totaux, att.totaux_fichier);

  if (att.statuts && Object.keys(att.statuts).length) {
    const obtenus = {};
    Object.keys(att.statuts).forEach((k) => {
      obtenus[k] = k === 'REIMPORT_FICHIER' ? (a.statut === 'REIMPORT_FICHIER' ? 1 : 0) : a.comparaison.compteurs.par_statut[k];
    });
    verifier('statuts', obtenus, att.statuts);
  }
  if (att.sous_types) {
    verifier('sous_types', a.comparaison.compteurs.par_sous_type, att.sous_types);
  }
  Object.entries(att.ecritures || {}).forEach(([cle, e]) => {
    const ob = a.comparaison && a.comparaison.ecritures.find((x) => court(x.cle) === cle && x.bloc <= 1);
    if (e.statut === null) { if (ob) ecarts.push(`écriture ${cle} présente alors qu'elle doit être absente`); return; }
    if (!ob) { ecarts.push(`écriture ${cle} absente du résultat`); return; }
    verifier(`${cle}.statut`, ob.statut, e.statut);
    if (e.sous_types) verifier(`${cle}.sous_types`, ob.sous_types, e.sous_types);
    if (e.nb_lignes !== undefined) verifier(`${cle}.nb_lignes`, ob.lignes.length, e.nb_lignes);
    if (e.doublon_intra) {
      const ignores = a.comparaison.ecritures.filter((x) => x.cle === ob.cle && x.statut === 'DOUBLON_INTRA');
      verifier(`${cle}.blocs_ignores`, ignores.length, e.doublon_intra.blocs_ignores);
      verifier(`${cle}.rangs_conserves`, ob.rangs, e.doublon_intra.rangs_conserves);
      verifier(`${cle}.rangs_ignores`, [].concat(...ignores.map((x) => x.rangs)), e.doublon_intra.rangs_ignores);
    }
    if (e.brouillard) verifier(`${cle}.brouillard`, (ob.lignes.length ? ob.lignes : ob.lignes_base).every((l) => l.valid_date === ''), true);
  });

  // Anomalies A / B / BND : liste exhaustive (code, gravité, objet quand il est identifiable).
  const bloquantes = a.anomalies.filter((x) => x.gravite !== 'I');
  const attendues = (att.anomalies || []).map((x) => ({ code: x.code, gravite: x.gravite, objet: objetComparable(x.objet) }));
  const cles = (liste) => liste.map((x) => x.code + ':' + x.gravite).sort();
  verifier('anomalies (code:gravité)', cles(bloquantes), cles(attendues));
  attendues.filter((x) => x.objet).forEach((x) => {
    const trouve = bloquantes.some((b) => b.code === x.code && b.objet_type === x.objet.type
      && (x.objet.type === 'ECRITURE' ? court(b.objet_cle) === x.objet.cle : b.objet_cle === x.objet.cle));
    if (!trouve) ecarts.push(`anomalie ${x.code} sur ${x.objet.cle} non trouvée`);
  });

  // Informations
  const infos = a.anomalies.filter((x) => x.gravite === 'I');
  const alias = { M_DESC: 'IDN_MOD_DESC', M_LET: 'IDN_MOD_LET' };
  (att.infos || []).forEach((x) => {
    if (x.code === 'REIMPORT_FICHIER') { verifier('info REIMPORT_FICHIER', a.statut, 'REIMPORT_FICHIER'); return; }
    const code = alias[x.code] || x.code;
    const objet = objetComparable(x.objet);
    // Les informations sont agrégées par code : l'écriture visée doit figurer dans la liste des clés.
    const trouve = infos.filter((i) => i.code === code && (!objet || i.cles.map(court).includes(objet.cle)));
    if (!trouve.length) { ecarts.push(`info ${x.code} ${x.objet || ''} non trouvée`); return; }
    if (x.nb_lignes !== undefined) verifier(`info ${x.code}.nb_lignes`, trouve[0].nb, x.nb_lignes);
    if (x.rangs !== undefined) verifier(`info ${x.code}.rangs`, trouve[0].rangs, x.rangs);
  });

  // Variations de soldes, selon les hypothèses définies dans les attendus :
  // - variations_soldes : ABSENTES non encore décidées, donc maintenues actives ;
  // - variations_soldes_si_absentes_acceptees : après acceptation des ABSENTES (= restitution du moteur) ;
  // - variations_soldes_modifiees : contribution des seules écritures MODIFIEE.
  const tri = (o) => Object.fromEntries(Object.entries(o).sort());
  if (att.variations_soldes && !a.comparaison) verifier('variations de soldes (import arrêté)', variationsEnTable(a.variations), tri(att.variations_soldes));
  if (att.variations_soldes && a.comparaison) {
    const simule = Publication.simulerActif({ base: res.etat.actif, comparaison: a.comparaison, hypothese: 'ABSENTES_MAINTENUES', hasher });
    verifier('variations de soldes (ABSENTES maintenues)', variationsEnTable(Controles.variationsSoldes(res.etat.actif, simule)), tri(att.variations_soldes));
  }
  if (att.variations_soldes_si_absentes_acceptees && a.comparaison) {
    verifier('variations de soldes (ABSENTES acceptées)', variationsEnTable(a.variations), tri(att.variations_soldes_si_absentes_acceptees));
  }
  if (att.variations_soldes_modifiees) {
    const v = {};
    a.comparaison.ecritures.filter((e) => e.statut === 'MODIFIEE').forEach((e) => {
      e.lignes.forEach((l) => { v[l.compte_num] = (v[l.compte_num] || 0) + l.debit_cts - l.credit_cts; });
      e.lignes_base.forEach((l) => { v[l.compte_num] = (v[l.compte_num] || 0) - l.debit_cts + l.credit_cts; });
    });
    Object.keys(v).forEach((k) => { if (v[k] === 0) delete v[k]; });
    verifier('variations de soldes (MODIFIEE seules)', tri(v), tri(att.variations_soldes_modifiees));
  }

  if (att.lignes_canoniques) {
    const ref = lire(att.lignes_canoniques).lignes;
    const lignes = a.lecture.lignes.slice().sort((x, y) => x.source_rang - y.source_rang);
    verifier('nombre de lignes canoniques', lignes.length, ref.length);
    ref.forEach((r, i) => {
      const l = lignes[i];
      if (!l) return;
      verifier(`ligne ${r.rang}.rang`, l.source_rang, r.rang);
      Object.keys(r).filter((k) => !['rang', 'cle', 'description', 'client_id', 'exercice_id'].includes(k)).forEach((k) => {
        if (l[k] !== r[k]) ecarts.push(`ligne ${r.rang}.${k} : obtenu ${JSON.stringify(l[k])}, attendu ${JSON.stringify(r[k])}`);
      });
    });
  }
  if (att.comparaison_S01) {
    const ref = lire(att.comparaison_S01.reference).lignes;
    // P3 : un montant négatif reste dans sa colonne ; le fond comptable se compare sur le montant signé (débit − crédit).
    const signature = (l) => [court(l.cle_ecriture || ''), l.compte_num, l.debit_cts - l.credit_cts].join('|');
    const sigRef = ref.map((r) => [r.cle, r.compte_num, r.debit_cts - r.credit_cts].join('|')).sort();
    verifier('fond identique à S01 (clé, compte, montant signé)', a.lecture.lignes.map(signature).sort(), sigRef);
  }
  return ecarts;
}

const scenarios = fs.readdirSync(path.join(FIX, 'attendus'))
  .filter((f) => /^S\d+[a-z0-9]*\.json$/.test(f))
  .sort()
  .map((f) => lire('attendus/' + f));

module.exports = { scenarios, executer, comparer };
