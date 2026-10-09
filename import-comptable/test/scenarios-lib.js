'use strict';
/**
 * Bibliothèque d'exécution des scénarios fictifs de l'ingénieur outils financiers (test/fixtures) et compare le moteur
 * aux résultats attendus, établis indépendamment du code (test/fixtures/attendus/*.json).
 *
 * Conventions de rapprochement (voir docs/import-comptable/resultats-tests.md) :
 * - rang des attendus = n° d'enregistrement de données (1 = première ligne après l'en-tête) ;
 *   rang du moteur = n° de ligne physique (en-tête = 1). Conversion : physique − 1 (aucun champ multiligne ici).
 * - montant devise absent : null dans les attendus, 0 dans le moteur.
 * - infos « M_DESC » / « M_LET » des attendus = codes IDN_MOD_DESC / IDN_MOD_LET du moteur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/app/pipeline');
const Publication = require('../src/core/publication');
const Controles = require('../src/core/controles');
const { lireFichier } = require('../src/adapters/node/fichiers');
const { hasher, choixComplets } = require('./aides');

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
      perimetre: spec.perimetre, totalSaisi: spec.total_saisi, import_id: importId, hasher
    })
  };
}

/** Rejoue un scénario : publie la base, puis analyse le fichier du scénario. */
function executer(scenario) {
  let etat = P.etatInitial(lire(scenario.client).client_id);
  scenario.base.forEach((b, i) => {
    const { analyse } = analyser(etat, b, b.client || scenario.client, 'BASE-' + (i + 1));
    assert.equal(analyse.rejete, false, `base ${b.fichier} rejetée : ${analyse.anomalies.map((a) => a.code)}`);
    const v = P.valider(etat, analyse, choixComplets(analyse), hasher);
    const r = P.publier(etat, analyse, v, 'PUB-BASE-' + (i + 1), hasher);
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
    const comp = a.comparaison || { lignesConservees: [], lignesDoublonsIgnorees: 0 };
    verifier('compteurs_lignes', {
      lues: c.lues, importees: comp.lignesConservees.length, rejetees: c.rejetees, vides: c.vides,
      doublons_ignores: comp.lignesDoublonsIgnorees
    }, att.compteurs_lignes);
  } else {
    // Import arrêté avant l'interprétation des lignes : aucune ligne normalisée, aucune comparaison.
    verifier('aucune ligne interprétée', a.lecture ? a.lecture.lignes.length : 0, 0);
    verifier('aucune comparaison', a.comparaison, null);
  }
  if (att.totaux) verifier('totaux (lignes importées)', somme(a.comparaison ? a.comparaison.lignesConservees : a.lecture.lignes), att.totaux);
  if (att.totaux_fichier) verifier('totaux_fichier', a.lecture.totauxLecture, att.totaux_fichier);

  if (att.statuts && Object.keys(att.statuts).length) {
    const obtenus = {};
    Object.keys(att.statuts).forEach((k) => {
      obtenus[k] = k === 'REIMPORT_FICHIER' ? (a.statut === 'REIMPORT_FICHIER' ? 1 : 0) : a.comparaison.compteurs[k];
    });
    verifier('statuts', obtenus, att.statuts);
  }
  if (att.sous_types) {
    const st = { M_FOND: 0, M_DATE: 0, M_DESC: 0, M_LET: 0 };
    a.comparaison.ecritures.forEach((e) => e.sous_types.forEach((s) => { st[s]++; }));
    verifier('sous_types', st, att.sous_types);
  }
  Object.entries(att.ecritures || {}).forEach(([cle, e]) => {
    const ob = a.comparaison && a.comparaison.ecritures.find((x) => court(x.cle) === cle);
    if (e.statut === null) { if (ob) ecarts.push(`écriture ${cle} présente alors qu'elle doit être absente`); return; }
    if (!ob) { ecarts.push(`écriture ${cle} absente du résultat`); return; }
    verifier(`${cle}.statut`, ob.statut, e.statut);
    if (e.sous_types) verifier(`${cle}.sous_types`, ob.sous_types, e.sous_types);
    if (e.nb_lignes !== undefined) verifier(`${cle}.nb_lignes`, ob.lignes.length, e.nb_lignes);
    if (e.doublon_intra) {
      verifier(`${cle}.blocs_ignores`, ob.doublons_ignores, e.doublon_intra.blocs_ignores);
      verifier(`${cle}.rangs_conserves`, ob.lignes.map((l) => l.source_rang - 1), e.doublon_intra.rangs_conserves);
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
    const trouve = infos.filter((i) => i.code === code && (!objet || court(i.objet_cle) === objet.cle));
    if (!trouve.length) { ecarts.push(`info ${x.code} ${x.objet || ''} non trouvée`); return; }
    if (x.nb_lignes !== undefined) verifier(`info ${x.code}.nb_lignes`, Number(trouve[0].obtenu), x.nb_lignes);
  });

  // Variations de soldes, selon les hypothèses définies dans les attendus :
  // - variations_soldes : ABSENTES non encore décidées, donc maintenues actives ;
  // - variations_soldes_si_absentes_acceptees : après acceptation des ABSENTES (= restitution du moteur) ;
  // - variations_soldes_modifiees : contribution des seules écritures MODIFIEE.
  const tri = (o) => Object.fromEntries(Object.entries(o).sort());
  if (att.variations_soldes && !a.comparaison) verifier('variations de soldes (import arrêté)', a.variationsSoldes, tri(att.variations_soldes));
  if (att.variations_soldes && a.comparaison) {
    const maintenir = {};
    a.comparaison.ecritures.forEach((e) => { if (e.statut === 'ABSENTE') maintenir[e.cle] = 'REPORTER'; });
    const simule = Publication.construireActif({ actif: res.etat.actif, comparaison: a.comparaison, decisions: maintenir,
      import_id: 'X', publication_id: 'SIMULATION', hasher }).actif;
    verifier('variations de soldes (ABSENTES maintenues)', Controles.variationsSoldes(res.etat.actif, simule), tri(att.variations_soldes));
  }
  if (att.variations_soldes_si_absentes_acceptees && a.comparaison) {
    verifier('variations de soldes (ABSENTES acceptées)', a.variationsSoldes, tri(att.variations_soldes_si_absentes_acceptees));
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
      Object.keys(r).filter((k) => !['rang', 'cle', 'description'].includes(k)).forEach((k) => {
        if (k === 'client_id' || k === 'exercice_id') return;
        const attendu = k === 'montant_devise_cts' && r[k] === null ? 0 : r[k];
        if (l[k] !== attendu) ecarts.push(`ligne ${r.rang}.${k} : obtenu ${JSON.stringify(l[k])}, attendu ${JSON.stringify(attendu)}`);
      });
    });
  }
  if (att.comparaison_S01) {
    const ref = lire(att.comparaison_S01.reference).lignes;
    const signature = (l) => [court(l.cle_ecriture || ''), l.compte_num, l.debit_cts, l.credit_cts].join('|');
    const sigRef = ref.map((r) => [r.cle, r.compte_num, r.debit_cts, r.credit_cts].join('|')).sort();
    verifier('fond identique à S01 (clé, compte, débit, crédit)', a.lecture.lignes.map(signature).sort(), sigRef);
  }
  return ecarts;
}

const scenarios = fs.readdirSync(path.join(FIX, 'attendus'))
  .filter((f) => /^S\d+[a-z0-9]*\.json$/.test(f))
  .sort()
  .map((f) => lire('attendus/' + f));

module.exports = { scenarios, executer, comparer };
