/**
 * Premier test Apps Script sur données FICTIVES (jeux S01 puis S03 de l'ingénieur, embarqués dans JeuxFictifs.js).
 *
 * Ce test n'ouvre aucun classeur, aucun fichier Drive et n'appelle aucun service externe : il n'exige aucune
 * autorisation OAuth. Il vérifie dans le moteur V8 d'Apps Script :
 *   1. le Hasher (Utilities.computeDigest) contre les vecteurs de référence ;
 *   2. le chargement du cœur dans l'espace global (ordre de chargement) ;
 *   3. un cycle complet S01 → publication → S03 → publication → annulation, comparé aux résultats obtenus sous Node.
 * Le journal ne contient que des codes, des compteurs, des durées et des empreintes (aucune donnée comptable).
 */
function testPrototypeFictif() {
  var t0 = new Date().getTime();
  var journal = [];
  function noter(etape, valeur) { journal.push(etape + ' : ' + JSON.stringify(valeur)); }
  var J = JeuxFictifs;
  var ecarts = [];
  function verifier(libelle, obtenu, attendu) {
    if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) ecarts.push(libelle + ' : obtenu ' + JSON.stringify(obtenu) + ', attendu ' + JSON.stringify(attendu));
  }

  Empreinte.verifierHasher(HasherGas);
  noter('hasher', 'vecteurs de référence conformes');

  function cycle(etat, jeu, importId, publicationId) {
    var a = Pipeline.analyserImport({
      etat: etat, fichier: { texte: jeu.texte, nomFichier: jeu.nom_fichier, sha256: jeu.sha256 }, profil: J.profil, client: J.client,
      perimetre: jeu.perimetre, identite: { dossier_client_id: J.client.client_id }, import_id: importId, horodatage: J.horodatage.valide,
      hasher: HasherGas
    });
    var validee = Pipeline.valider(etat, a, choixTest(a), HasherGas);
    var r = Pipeline.publier(etat, a, validee, { publication_id: publicationId, horodatage: J.horodatage.valide }, HasherGas);
    if (!r.ok) throw new Error('PUBLICATION_REFUSEE ' + r.refus.join(','));
    return { analyse: a, etat: r.etat, publication: r.publication };
  }

  var etat0 = Pipeline.etatInitial(J.client.client_id);
  var c1 = cycle(etat0, J.s01, 'IMPORT-S01', 'PUB-1');
  var c2 = cycle(c1.etat, J.s03, 'IMPORT-S03', 'PUB-2');
  var u = Pipeline.annulerDernierePublication(c2.etat, { publication_id: 'ANN-1', horodatage: J.horodatage.valide, tampon_inactif: c1.etat.actif }, HasherGas);
  if (!u.ok) throw new Error('ANNULATION_REFUSEE ' + u.refus.join(','));

  var obtenu = {
    s01_statuts: c1.analyse.comparaison.compteurs.par_statut,
    s03_statuts: c2.analyse.comparaison.compteurs.par_statut,
    s03_anomalies: c2.analyse.anomalies.map(function (x) { return x.code + ':' + x.gravite; }),
    checksum_pub1: c1.publication.checksum_apres,
    checksum_pub2: c2.publication.checksum_apres,
    checksum_apres_annulation: u.publication.checksum_apres,
    nb_lignes_actif_pub2: c2.etat.actif.length
  };
  Object.keys(J.attendu_node).forEach(function (k) { verifier(k, obtenu[k], J.attendu_node[k]); });
  noter('statuts S03', obtenu.s03_statuts);
  noter('checksum après annulation = publication 1', obtenu.checksum_apres_annulation === obtenu.checksum_pub1);
  var resultat = { ok: ecarts.length === 0, ecarts: ecarts, duree_ms: new Date().getTime() - t0, journal: journal };
  // Message lisible en premier : c'est la seule ligne à relever pour le dirigeant.
  Logger.log(resultat.ok
    ? 'RESULTAT G0 : REUSSI - le moteur donne dans Google Apps Script exactement les memes resultats que les tests (duree : ' + resultat.duree_ms + ' ms).'
    : 'RESULTAT G0 : ECHEC - ' + ecarts.length + ' ecart(s) avec les tests. Copier tout le journal et le transmettre.');
  Logger.log(JSON.stringify(resultat, null, 1));
  return resultat;
}

/** Décisions de test « tout traité » (même règle que test/aides.js côté Node). */
function choixTest(a) {
  var J = JeuxFictifs;
  var decisions = [];
  var motif = 'Dérogation de test motivée par le scénario';
  (a.comparaison ? a.comparaison.ecritures : []).forEach(function (e) {
    if (e.statut === 'ABSENTE') decisions.push({ decision_id: 'ABS:' + e.cle, type: 'ABSENTE', import_id: a.import_id, cle: e.cle, choix: 'ACCEPTER', motif: motif, par: 'TEST', le: J.horodatage.valide });
  });
  a.anomalies.filter(function (x) { return x.gravite === 'B' && x.code !== 'IDN_ABSENTE'; }).forEach(function (x) {
    decisions.push({ decision_id: 'DER:' + x.anomalie_id, type: 'DEROGATION', import_id: a.import_id, anomalie_id: x.anomalie_id,
      empreinte_derogation: x.empreinte_derogation, motif: motif, reference: '', par: 'TEST', le: J.horodatage.valide, origine: 'MANUELLE', source_decision_id: '' });
  });
  var parCode = {};
  a.anomalies.filter(function (x) { return x.gravite === 'A' && x.code !== 'IDN_ABSENTE'; }).forEach(function (x) { (parCode[x.code] = parCode[x.code] || []).push(x.anomalie_id); });
  Object.keys(parCode).sort().forEach(function (code) {
    decisions.push({ decision_id: 'ACQ:' + code, type: 'ACQUITTEMENT', import_id: a.import_id, code: code, anomalie_ids: parCode[code], commentaire: 'Revu en test', par: 'TEST', le: J.horodatage.valide });
  });
  return { decisions: decisions, checklist: { fichier_plus_recent: true, variations_expliquees: true, decisions_revues: true },
    validation_id: 'VAL-' + a.import_id, soumis_par: 'TEST', soumis_le: J.horodatage.soumis, valide_par: 'TEST', valide_le: J.horodatage.valide };
}
