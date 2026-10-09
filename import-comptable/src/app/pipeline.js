/**
 * Cas d'usage, en mémoire : analyser un import, le publier, annuler la dernière publication.
 *
 * L'état d'un client est une valeur immuable : chaque opération renvoie un nouvel état.
 * À l'intégration Apps Script, cet état sera porté par les onglets (CONFIG, IMPORTS, JOURNAL,
 * ACTIF_A/B, MOUVEMENTS) via des adaptateurs ; les règles restent ici.
 */
var Pipeline = (function (Lecture, Comparaison, Controles, Publication, Anomalies, Identite) {
  'use strict';

  /** @returns {{client_id: string, actif: object[], mouvements: object[], publications: object[], imports: object[], typeProfilParExercice: Object<string, string>}} */
  function etatInitial(clientId) {
    return { client_id: clientId, actif: [], mouvements: [], publications: [], imports: [], typeProfilParExercice: {} };
  }

  /** Empreintes des fichiers publiés et non annulés (détection REIMPORT_FICHIER). */
  function shaPublies(etat) {
    var annulees = {};
    etat.publications.forEach(function (p) { if (p.type_pub === 'ANNULATION') annulees[p.annule] = true; });
    return etat.imports.filter(function (i) { return i.publication_id && !annulees[i.publication_id]; }).map(function (i) { return i.file_sha256; });
  }

  /**
   * @param {{etat: object, fichier: {texte: string, nomFichier: string, sha256: string}, profil: object,
   *          client: object, perimetre: object, totalSaisi?: object, import_id: string, hasher: object}} e
   */
  function analyserImport(e) {
    var etat = e.etat;
    if (etat.client_id !== e.client.client_id) throw new Error('Isolation : état du client ' + etat.client_id + ' ≠ ' + e.client.client_id);
    var resultat = {
      import_id: e.import_id,
      file_sha256: e.fichier.sha256,
      nomFichier: e.fichier.nomFichier,
      profil: e.profil,
      perimetre: e.perimetre,
      statut: 'ANALYSE',
      rejete: false,
      lecture: null,
      comparaison: null,
      anomalies: [],
      actifSimule: null,
      variationsSoldes: {}
    };

    var integrite = verifierIntegrite(etat, e.hasher);
    if (integrite) resultat.anomalies.push(integrite);

    // Contrôles préalables AVANT la détection de réimport : un fichier d'un autre client doit être
    // refusé comme tel, même si ses octets sont identiques à un fichier déjà publié.
    Array.prototype.push.apply(resultat.anomalies, Controles.controlesPrealables({
      client: e.client, profil: e.profil, nomFichier: e.fichier.nomFichier, perimetre: e.perimetre,
      typeProfilExercice: etat.typeProfilParExercice[e.perimetre.exercice_id]
    }));
    if (resultat.anomalies.some(function (a) { return a.gravite === 'BND'; })) {
      resultat.statut = 'REJETE';
      resultat.rejete = true;
      return finaliser(resultat, etat, e);
    }

    if (shaPublies(etat).indexOf(e.fichier.sha256) !== -1) {
      resultat.statut = 'REIMPORT_FICHIER';
      return resultat;
    }

    var lecture = Lecture.normaliserFichier({
      texte: e.fichier.texte, nomFichier: e.fichier.nomFichier, profil: e.profil, client: e.client, perimetre: e.perimetre
    });
    resultat.lecture = lecture;
    Array.prototype.push.apply(resultat.anomalies, Controles.controlesStructure({ lecture: lecture }));

    if (lecture.structureValide) {
      var comparaison = Comparaison.classer({
        actif: etat.actif, lignes: lecture.lignes, perimetre: e.perimetre, profil: e.profil, hasher: e.hasher
      });
      resultat.comparaison = comparaison;
      var sansCollision = comparaison.ecritures.some(function (ec) { return ec.statut === 'COLLISION'; })
        ? { ecritures: comparaison.ecritures.filter(function (ec) { return ec.statut !== 'COLLISION'; }) }
        : comparaison;
      var toutAccepter = {};
      comparaison.ecritures.forEach(function (ec) { if (ec.statut === 'ABSENTE') toutAccepter[ec.cle] = 'ACCEPTER'; });
      resultat.actifSimule = Publication.construireActif({
        actif: etat.actif, comparaison: sansCollision, decisions: toutAccepter,
        import_id: e.import_id, publication_id: 'SIMULATION', hasher: e.hasher
      }).actif;
      resultat.variationsSoldes = Controles.variationsSoldes(etat.actif, resultat.actifSimule);
      Array.prototype.push.apply(resultat.anomalies, Controles.controlesContenu({
        client: e.client, profil: e.profil, perimetre: e.perimetre, lecture: lecture, comparaison: comparaison,
        actif: etat.actif, actifSimule: comparaison === sansCollision ? resultat.actifSimule : null, totalSaisi: e.totalSaisi
      }));
    }
    resultat.rejete = resultat.anomalies.some(function (a) { return a.gravite === 'BND'; });
    if (resultat.rejete) resultat.statut = 'REJETE';
    return finaliser(resultat, etat, e);
  }

  /** Empreintes de dérogation (A5) et dérogations reconductibles depuis la dernière publication. */
  function finaliser(resultat, etat, e) {
    var exercice = e.client.exercices.filter(function (x) { return x.id === e.perimetre.exercice_id; })[0];
    var parCle = {};
    if (resultat.comparaison) resultat.comparaison.ecritures.forEach(function (ec) { parCle[ec.cle] = ec; });
    resultat.anomalies.forEach(function (a) {
      a.empreinte_objet = empreinteObjet(a, parCle, resultat.lecture, e.hasher);
      a.empreinte_derogation = Anomalies.empreinteDerogation(a, {
        perimetre: e.perimetre, statut_exercice: exercice ? exercice.statut : '',
        profil_id: e.profil.profil_id, profil_version: e.profil.version, empreinte_objet: a.empreinte_objet
      }, e.hasher);
    });
    resultat.derogationsReconduites = Anomalies.reconduireDerogations(resultat.anomalies, derogationsEnVigueur(etat));
    return resultat;
  }

  /** Contenu de l'objet concerné : lignes base et fichier de l'écriture, sources du compte, ou rien. */
  function empreinteObjet(a, parCle, lecture, hasher) {
    var contenu = '';
    if (a.objet_type === 'ECRITURE' && parCle[a.objet_cle]) {
      var ec = parCle[a.objet_cle];
      var f = function (l) { return Identite.empreinteLigne(l, hasher); };
      contenu = 'F:' + ec.lignes.map(f).sort().join(',') + ';B:' + ec.lignes_base.map(f).sort().join(',');
    } else if (a.objet_type === 'COMPTE' && lecture) {
      contenu = (lecture.comptesSources[a.objet_cle] || []).slice().sort().join(',');
    }
    return 'v1:' + hasher.sha256Hex('OBJET\u001F' + a.anomalie_id + '\u001F' + contenu);
  }

  /** Dérogations de la dernière publication appliquée, si elle n'a pas été annulée. */
  function derogationsEnVigueur(etat) {
    var derniere = etat.publications[etat.publications.length - 1];
    return derniere && derniere.type_pub === 'PUBLICATION' ? (derniere.derogations || []) : [];
  }

  function verifierIntegrite(etat, hasher) {
    var derniere = etat.publications[etat.publications.length - 1];
    if (!derniere) return null;
    var courant = Publication.checksumActif(etat.actif, hasher).checksum;
    if (courant === derniere.checksum_apres) return null;
    return Anomalies.creer('SYS_ACTIF_ALTERE', { attendu: derniere.checksum_apres, obtenu: courant });
  }

  /**
   * Fige la validation (A7) : à appeler quand le dirigeant valide.
   * @param {{decisions?: Object<string, string>, derogations?: {anomalie_id: string, motif: string, par: string}[],
   *          acquittements?: string[], checklist?: object, valide_par?: string, valide_le?: string}} choix
   *   Les dérogations reconduites (A5) sont ajoutées d'office ; elles sont couvertes par la validation.
   */
  function valider(etat, analyse, choix, hasher) {
    choix = choix || {};
    var derniere = etat.publications[etat.publications.length - 1];
    var parId = {};
    analyse.anomalies.forEach(function (a) { parId[a.anomalie_id] = a; });
    var manuelles = (choix.derogations || []).map(function (d) {
      return { anomalie_id: d.anomalie_id, motif: d.motif, par: d.par,
        empreinte_derogation: parId[d.anomalie_id] ? parId[d.anomalie_id].empreinte_derogation : '', origine: 'MANUELLE' };
    });
    var dejaManuelles = {};
    manuelles.forEach(function (d) { dejaManuelles[d.anomalie_id] = true; });
    var reconduites = (analyse.derogationsReconduites || []).filter(function (d) { return !dejaManuelles[d.anomalie_id]; });
    return Publication.preparerValidation({
      actif: etat.actif, comparaison: analyse.comparaison, anomalies: analyse.anomalies, decisions: choix.decisions,
      derogations: reconduites.concat(manuelles), acquittements: choix.acquittements, checklist: choix.checklist,
      version_base: derniere ? derniere.publication_id : '',
      valide_par: choix.valide_par, valide_le: choix.valide_le, hasher: hasher
    });
  }

  /**
   * Publie une analyse validée. Revalide données et version au moment de la publication (A7).
   * @returns {{ok: true, etat: object, publication: object} | {ok: false, code: string, details: *}}
   */
  function publier(etat, analyse, validation, publicationId, hasher) {
    if (analyse.statut === 'REIMPORT_FICHIER') return { ok: false, code: 'REIMPORT_FICHIER', details: null };
    if (!analyse.comparaison) return { ok: false, code: 'ANALYSE_INCOMPLETE', details: null };
    var enCours = etat.imports.filter(function (i) { return i.import_id === analyse.import_id; });
    if (enCours.length) return { ok: false, code: 'IMPORT_DEJA_PUBLIE', details: analyse.import_id };
    var derniere = etat.publications[etat.publications.length - 1];
    var plan = Publication.planifierPublication({
      actif: etat.actif, comparaison: analyse.comparaison, anomalies: analyse.anomalies, validation: validation,
      import_id: analyse.import_id, publication_id: publicationId,
      version_base: derniere ? derniere.publication_id : '', hasher: hasher
    });
    if (!plan.ok) return plan;
    var typeProfil = {};
    Object.keys(etat.typeProfilParExercice).forEach(function (k) { typeProfil[k] = etat.typeProfilParExercice[k]; });
    typeProfil[analyse.perimetre.exercice_id] = analyse.profil.type;
    plan.publication.derogations = validation.derogations;
    return {
      ok: true,
      publication: plan.publication,
      etat: {
        client_id: etat.client_id,
        actif: plan.actif,
        mouvements: etat.mouvements.concat(plan.mouvements),
        publications: etat.publications.concat([plan.publication]),
        imports: etat.imports.concat([{ import_id: analyse.import_id, file_sha256: analyse.file_sha256, publication_id: publicationId }]),
        typeProfilParExercice: typeProfil
      }
    };
  }

  /** Annule la dernière publication (un seul niveau ; pas d'annulation d'une annulation). */
  function annulerDernierePublication(etat, annulationId, hasher) {
    var derniere = etat.publications[etat.publications.length - 1];
    if (!derniere) return { ok: false, code: 'AUCUNE_PUBLICATION', details: null };
    if (derniere.type_pub !== 'PUBLICATION') return { ok: false, code: 'ANNULATION_NON_ANNULABLE', details: derniere.publication_id };
    var plan = Publication.planifierAnnulation({
      actif: etat.actif, mouvements: etat.mouvements, publication: derniere,
      publication_annulation_id: annulationId, hasher: hasher
    });
    if (!plan.ok) return plan;
    var typeProfil = {};
    var exercicesRestants = {};
    plan.actif.forEach(function (l) { exercicesRestants[l.exercice_id] = true; });
    Object.keys(etat.typeProfilParExercice).forEach(function (k) {
      if (exercicesRestants[k]) typeProfil[k] = etat.typeProfilParExercice[k];
    });
    return {
      ok: true,
      publication: plan.publication,
      etat: {
        client_id: etat.client_id,
        actif: plan.actif,
        mouvements: etat.mouvements.concat(plan.mouvements),
        publications: etat.publications.concat([plan.publication]),
        imports: etat.imports,
        typeProfilParExercice: typeProfil
      }
    };
  }

  return {
    etatInitial: etatInitial,
    analyserImport: analyserImport,
    valider: valider,
    publier: publier,
    annulerDernierePublication: annulerDernierePublication
  };
})(
  typeof Lecture !== 'undefined' ? Lecture : require('../core/lecture'),
  typeof Comparaison !== 'undefined' ? Comparaison : require('../core/comparaison'),
  typeof Controles !== 'undefined' ? Controles : require('../core/controles'),
  typeof Publication !== 'undefined' ? Publication : require('../core/publication'),
  typeof Anomalies !== 'undefined' ? Anomalies : require('../core/anomalies'),
  typeof Identite !== 'undefined' ? Identite : require('../core/identite')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Pipeline;
