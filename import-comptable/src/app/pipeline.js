/**
 * Cas d'usage en mémoire : analyser un import, valider, publier, annuler la dernière publication.
 *
 * L'état d'un client est une valeur immuable : chaque opération renvoie un nouvel état.
 * À l'intégration Apps Script, cet état sera porté par les onglets (CONFIG, IMPORTS, JOURNAL,
 * ACTIF_A/B, MOUVEMENTS) via des adaptateurs ; les règles restent ici.
 */
var Pipeline = (function (C, E, Lecture, Comparaison, Controles, Publication, Anomalies) {
  'use strict';

  /** @returns {{client_id: string, actif: object[], mouvements: object[], publications: object[], imports: object[]}} */
  function etatInitial(clientId) {
    return { client_id: clientId, actif: [], mouvements: [], publications: [], imports: [] };
  }

  /**
   * @param {{etat: object, fichier: {texte: string, nomFichier: string, sha256: string}, profil: object, client: object,
   *          perimetre: object, identite?: object, totalSaisi?: object, import_id: string, horodatage?: string, hasher: object}} e
   */
  function analyserImport(e) {
    E.verifierHasher(e.hasher);
    var etat = e.etat;
    if (!etat || etat.client_id !== e.client.client_id) throw C.erreurContrat('CLIENT_INCOHERENT', 'etat');
    var exercice = e.client.exercices.filter(function (x) { return x.id === e.perimetre.exercice_id; })[0];
    var r = {
      import_id: e.import_id,
      client_id: e.client.client_id,
      file_sha256: e.fichier.sha256,
      nom_fichier: e.fichier.nomFichier,
      perimetre: e.perimetre,
      profil_ref: { profil_id: e.profil.profil_id, version: e.profil.version, type: e.profil.type },
      version_regles: C.VERSION_REGLES,
      statut: 'ANALYSE',
      rejete: false,
      lecture: null,
      comparaison: null,
      anomalies: [],
      controles: [],
      variations: [],
      total_saisi: e.totalSaisi || null,
      decisions_reconduites: []
    };
    var anomalies = [];

    // Intégrité de l'actif : son checksum doit être celui de la dernière publication appliquée.
    var derniere = etat.publications[etat.publications.length - 1];
    var checksumAttendu = derniere ? derniere.checksum_apres : Publication.checksumActif([], e.hasher);
    var checksumCourant = Publication.checksumActif(etat.actif, e.hasher);
    if (checksumCourant !== checksumAttendu) anomalies.push(Anomalies.creer('SYS_ACTIF_ALTERE', { objet_type: 'ACTIF', attendu: checksumAttendu, obtenu: checksumCourant }));

    // Contrôles préalables AVANT la détection de réimport (un fichier d'un autre client est refusé comme tel).
    anomalies = anomalies.concat(Controles.controlesPrealables({
      client: e.client, profil: e.profil, nomFichier: e.fichier.nomFichier, perimetre: e.perimetre, actif: etat.actif, identite: e.identite
    }));
    if (anomalies.some(function (a) { return a.gravite === 'BND'; })) {
      r.statut = 'REJETE';
      return finaliser(r, anomalies, etat, e, exercice);
    }
    if (Comparaison.detecterReimport(e.fichier.sha256, etat.imports)) {
      r.statut = 'REIMPORT_FICHIER';
      return finaliser(r, anomalies, etat, e, exercice);
    }

    r.lecture = Lecture.normaliserFichier({
      texte: e.fichier.texte, nomFichier: e.fichier.nomFichier, profil: e.profil, client: e.client, perimetre: e.perimetre,
      import_id: e.import_id, file_sha256: e.fichier.sha256
    });
    var simule = null;
    var collisions = false;
    if (r.lecture.structure_ok) {
      r.comparaison = Comparaison.classer({
        base: etat.actif, lignes: r.lecture.lignes, perimetre: e.perimetre, profil: e.profil, client_id: e.client.client_id, hasher: e.hasher
      });
      collisions = r.comparaison.ecritures.some(function (ec) { return ec.statut === 'COLLISION'; });
      simule = Publication.simulerActif({ base: etat.actif, comparaison: r.comparaison, hypothese: 'ABSENTES_ACCEPTEES', hasher: e.hasher });
      r.variations = Controles.variationsSoldes(etat.actif, simule);
    }
    var resultatControles = Controles.executerControles({
      client: e.client, profil: e.profil, perimetre: e.perimetre, lecture: r.lecture, comparaison: r.comparaison,
      // REC_MIROIR sans objet en cas de collision : l'import est déjà bloqué par IDN_COLLISION.
      base: etat.actif, actif_simule: collisions ? null : simule, total_saisi: e.totalSaisi
    });
    r.controles = resultatControles.controles;
    anomalies = anomalies.concat(resultatControles.anomalies);
    if (anomalies.some(function (a) { return a.gravite === 'BND'; })) r.statut = 'REJETE';
    return finaliser(r, anomalies, etat, e, exercice);
  }

  /** Empreintes d'objet et de dérogation (A5, P1) ; dérogations reconductibles depuis la dernière publication. */
  function finaliser(r, anomalies, etat, e, exercice) {
    var parCle = {};
    var parCompte = {};
    if (r.comparaison) {
      r.comparaison.ecritures.forEach(function (ec) {
        if (ec.bloc !== 1 && ec.statut !== 'ABSENTE') return;
        parCle[ec.cle] = ec;
        ec.lignes.forEach(function (l) {
          var t = parCompte[l.compte_num] || (parCompte[l.compte_num] = []);
          if (ec.h_ecr && t.indexOf(ec.h_ecr) === -1) t.push(ec.h_ecr);
        });
      });
    }
    var ctx = { perimetre: e.perimetre, statut_exercice: exercice ? exercice.statut : '', profil_id: e.profil.profil_id, profil_version: e.profil.version };
    r.anomalies = anomalies.map(function (a) {
      var h = [];
      if (a.objet_type === 'ECRITURE' && parCle[a.objet_cle]) h = [parCle[a.objet_cle].h_ecr_base, parCle[a.objet_cle].h_ecr];
      else if (a.objet_type === 'COMPTE') h = parCompte[a.objet_cle] || [];
      else h = a.cles.map(function (k) { return parCle[k] ? parCle[k].h_ecr || parCle[k].h_ecr_base : ''; });
      var c = {};
      Object.keys(a).forEach(function (k) { c[k] = a[k]; });
      c.empreinte_objet = Anomalies.empreinteObjet(c, h, e.hasher);
      c.empreinte_derogation = Anomalies.empreinteDerogation(c, ctx, e.hasher);
      return c;
    }).sort(function (a, b) { return E.comparerTexte(a.anomalie_id, b.anomalie_id); });
    r.rejete = r.anomalies.some(function (a) { return a.gravite === 'BND'; });
    var derniere = etat.publications[etat.publications.length - 1];
    var precedentes = derniere && derniere.type_pub === 'PUBLICATION' && derniere.statut === 'PUBLIEE' ? derniere.derogations_retenues || [] : [];
    r.decisions_reconduites = Anomalies.reconduireDerogations({
      anomalies: r.anomalies, derogations_precedentes: precedentes, import_id: r.import_id, horodatage: e.horodatage || ''
    });
    return r;
  }

  /**
   * Fige la validation (A7). Les dérogations reconduites (A5) sont ajoutées d'office, sauf si une dérogation
   * manuelle porte sur la même anomalie ; elles entrent dans l'empreinte du staging, donc dans la validation.
   * @param {{decisions?: object[], checklist?: object, validation_id: string, soumis_par: string, soumis_le: string,
   *          valide_par: string, valide_le: string}} choix
   * @returns {{validation: object, decisions: object[]}}
   */
  function valider(etat, analyse, choix, hasher) {
    E.verifierHasher(hasher);
    var manuelles = (choix.decisions || []).slice();
    var derogees = {};
    manuelles.forEach(function (d) { if (d.type === 'DEROGATION') derogees[d.anomalie_id] = true; });
    var decisions = analyse.decisions_reconduites.filter(function (d) { return !derogees[d.anomalie_id]; }).concat(manuelles);
    return {
      decisions: decisions,
      validation: {
        validation_id: choix.validation_id,
        import_id: analyse.import_id,
        client_id: analyse.client_id,
        decision: 'VALIDE',
        empreinte_staging: Publication.empreinteStaging({ resultat: analyse, decisions: decisions }, hasher),
        checksum_base: Publication.checksumActif(etat.actif, hasher),
        version_base: Publication.versionActif(etat.publications),
        checklist: choix.checklist || {},
        soumis_par: choix.soumis_par || '', soumis_le: choix.soumis_le || '',
        valide_par: choix.valide_par || '', valide_le: choix.valide_le || ''
      }
    };
  }

  /**
   * @param {{validation: object, decisions: object[]}} validee résultat de valider()
   * @param {{publication_id: string, horodatage?: string, autre_import_en_cours?: boolean}} options
   * @returns {{ok: true, etat: object, publication: object} | {ok: false, refus: string[], details: object}}
   */
  function publier(etat, analyse, validee, options, hasher) {
    if (analyse.statut === 'REIMPORT_FICHIER') return { ok: false, refus: ['PUB_REIMPORT'], details: {} };
    var plan = Publication.planifierPublication({
      base: etat.actif, publications: etat.publications, resultat: analyse, decisions: validee ? validee.decisions : [],
      validation: validee ? validee.validation : null, autre_import_en_cours: !!options.autre_import_en_cours,
      publication_id: options.publication_id, horodatage: options.horodatage, hasher: hasher
    });
    if (!plan.ok) return plan;
    return {
      ok: true,
      publication: plan.publication,
      etat: {
        client_id: etat.client_id,
        actif: plan.actif_suivant,
        mouvements: etat.mouvements.concat(plan.mouvements),
        publications: etat.publications.concat([plan.publication]),
        imports: etat.imports.concat([{ import_id: analyse.import_id, file_sha256: analyse.file_sha256, statut: 'PUBLIE',
          publication_id: options.publication_id }])
      }
    };
  }

  /**
   * Annule la dernière publication (un seul niveau ; pas d'annulation d'une annulation).
   * @param {{publication_id: string, horodatage?: string, import_en_cours?: boolean, tampon_inactif?: object[]}} options
   */
  function annulerDernierePublication(etat, options, hasher) {
    var derniere = etat.publications[etat.publications.length - 1];
    if (!derniere) return { ok: false, refus: ['ANN_PAS_DERNIERE'], details: {} };
    var plan = Publication.planifierAnnulation({
      actif: etat.actif, publications: etat.publications, mouvements: etat.mouvements, publication_id_annulee: derniere.publication_id,
      import_en_cours: !!options.import_en_cours, tampon_inactif: options.tampon_inactif,
      publication_id: options.publication_id, horodatage: options.horodatage, hasher: hasher
    });
    if (!plan.ok) return plan;
    return {
      ok: true,
      publication: plan.publication_annulation,
      etat: {
        client_id: etat.client_id,
        actif: plan.actif_restaure,
        mouvements: etat.mouvements.concat(plan.mouvements_inverses),
        publications: etat.publications.map(function (p) { return p.publication_id === derniere.publication_id ? plan.publication_annulee : p; })
          .concat([plan.publication_annulation]),
        imports: etat.imports.map(function (i) {
          if (i.publication_id !== derniere.publication_id) return i;
          var c = {};
          Object.keys(i).forEach(function (k) { c[k] = i[k]; });
          c.statut = 'ANNULE';
          return c;
        })
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
  typeof Constantes !== 'undefined' ? Constantes : require('../core/constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('../core/empreinte'),
  typeof Lecture !== 'undefined' ? Lecture : require('../core/lecture'),
  typeof Comparaison !== 'undefined' ? Comparaison : require('../core/comparaison'),
  typeof Controles !== 'undefined' ? Controles : require('../core/controles'),
  typeof Publication !== 'undefined' ? Publication : require('../core/publication'),
  typeof Anomalies !== 'undefined' ? Anomalies : require('../core/anomalies')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Pipeline;
