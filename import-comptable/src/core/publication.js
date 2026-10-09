/**
 * Version et checksum de l'actif, simulation, empreinte de staging, plan de publication et d'annulation
 * (contrat §4.8, §4.9, §5.3, §5.4, §7). L'actif n'est jamais modifié sur place.
 *
 * Mouvements : au plus un par (publication_id, ligne_uid), avec l'image complète de la ligne avant
 * changement ; c'est elle qui permet le retour arrière par reconstruction (D8).
 */
var Publication = (function (C, E, Identite, Anomalies) {
  'use strict';

  function copier(o) {
    var c = {};
    Object.keys(o).forEach(function (k) { c[k] = o[k]; });
    return c;
  }
  function parUid(a, b) { return E.comparerTexte(a.ligne_uid, b.ligne_uid); }

  // ------------------------------------------------------------------ version, checksum, statistiques

  /** Identifiant de la dernière publication appliquée (PUBLICATION ou ANNULATION) ; "" si aucune. */
  function versionActif(publications) {
    var p = publications || [];
    return p.length ? p[p.length - 1].publication_id : '';
  }

  /** checksumActif = H("actif", [n].concat(hLigne des lignes triées par ligne_uid)). Actif vide : H("actif", ["0"]). */
  function checksumActif(actif, hasher) {
    var lignes = (actif || []).slice().sort(parUid);
    return E.H('actif', [String(lignes.length)].concat(lignes.map(function (l) { return Identite.hLigne(l, hasher); })), hasher);
  }

  function statsActif(actif) {
    var s = { nb_lignes: 0, nb_actives: 0, debit_cts: 0, credit_cts: 0 };
    (actif || []).forEach(function (l) {
      s.nb_lignes++;
      if (l.statut === 'ACTIVE') { s.nb_actives++; s.debit_cts += l.debit_cts; s.credit_cts += l.credit_cts; }
    });
    return s;
  }

  // ------------------------------------------------------------------ construction de l'actif suivant

  function versActive(l, version, premierImport, publicationId, hasher) {
    var a = {};
    C.CHAMPS_ACTIF.forEach(function (k) { a[k] = l[k] === undefined ? '' : l[k]; });
    a.montant_devise_cts = l.montant_devise_cts === undefined ? null : l.montant_devise_cts;
    a.version = version;
    a.statut = 'ACTIVE';
    a.first_import_id = premierImport || l.source_import_id;
    a.last_publication_id = publicationId;
    var h = Identite.empreintes(a, hasher);
    a.h_fond = h.h_fond; a.h_desc = h.h_desc; a.h_let = h.h_let;
    return a;
  }

  /** Décisions ABSENTE indexées par clé (ACCEPTER | REPORTER). */
  function choixAbsentes(decisions) {
    var choix = {};
    (decisions || []).forEach(function (d) { if (d.type === 'ABSENTE') choix[d.cle] = d.choix; });
    return choix;
  }

  /**
   * Construit l'actif suivant et les mouvements, sans vérification.
   * @param {{base: object[], comparaison: object, choix: Object<string, string>, publication_id: string,
   *          type_pub?: string, import_id: string, hasher: object}} e
   */
  function construire(e) {
    var parCle = {};
    (e.base || []).forEach(function (l) { (parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = [])).push(l); });
    var bruts = [];

    e.comparaison.ecritures.forEach(function (ec) {
      var avant = parCle[ec.cle] || [];
      var versionAvant = avant.reduce(function (v, l) { return Math.max(v, l.version); }, 0);
      var apres = null;
      var nature = null;
      if (ec.statut === 'NOUVELLE' || ec.statut === 'MODIFIEE') {
        var premier = avant.length ? avant[0].first_import_id : '';
        apres = ec.lignes.map(function (l) { return versActive(l, versionAvant + 1, premier, e.publication_id, e.hasher); });
        nature = ec.statut === 'MODIFIEE' && ec.sous_types.length === 1 && ec.sous_types[0] === 'M_LET' ? 'LETTRAGE' : 'MODIFICATION';
      } else if (ec.statut === 'ABSENTE' && e.choix[ec.cle] === 'ACCEPTER') {
        apres = avant.map(function (l) {
          var s = copier(l);
          s.statut = 'SUPPRIMEE_SOURCE';
          s.version = versionAvant + 1;
          s.last_publication_id = e.publication_id;
          return s;
        });
        nature = 'SUPPRESSION_LOGIQUE';
      } else if (ec.statut === 'COLLISION') {
        throw C.erreurContrat('ARGUMENT_MANQUANT', 'collision');
      }
      if (!apres) return;
      var sousTypes = ec.sous_types.slice();
      if (ec.reactivation) sousTypes.push('REACTIVATION'); // P4 : réapparition tracée dans le mouvement
      var avantParUid = {};
      avant.forEach(function (l) { avantParUid[l.ligne_uid] = l; });
      var apresParUid = {};
      apres.forEach(function (l) { apresParUid[l.ligne_uid] = l; });
      var uids = Object.keys(avantParUid).concat(Object.keys(apresParUid).filter(function (u) { return !avantParUid[u]; }));
      uids.forEach(function (uid) {
        var a = avantParUid[uid], b = apresParUid[uid];
        var type = a && b ? nature : (b ? 'INSERTION' : 'RETRAIT_LIGNE');
        bruts.push({
          cle_ecriture: ec.cle, ligne_uid: uid, type: type, sous_types: sousTypes,
          version_avant: a ? a.version : 0, version_apres: b ? b.version : 0,
          h_avant: a ? Identite.hLigne(a, e.hasher) : '', h_apres: b ? Identite.hLigne(b, e.hasher) : '',
          image_avant: a ? copier(a) : null
        });
      });
      parCle[ec.cle] = apres;
    });

    var actif = [];
    Object.keys(parCle).forEach(function (cle) { actif.push.apply(actif, parCle[cle]); });
    actif.sort(parUid);
    bruts.sort(function (x, y) { return x.cle_ecriture !== y.cle_ecriture ? E.comparerTexte(x.cle_ecriture, y.cle_ecriture) : E.comparerTexte(x.ligne_uid, y.ligne_uid); });
    var mouvements = bruts.map(function (m, i) {
      var r = copier(m);
      r.mouvement_id = e.publication_id + ':' + ('00000' + (i + 1)).slice(-6);
      r.publication_id = e.publication_id;
      r.type_pub = e.type_pub || 'PUBLICATION';
      r.import_id = e.import_id || '';
      r.annule_mouvement_id = '';
      return r;
    });
    return { actif: actif, mouvements: mouvements };
  }

  /**
   * Simulation (contrôles REC_MIROIR, variations de soldes).
   * hypothese : 'ABSENTES_ACCEPTEES' | 'ABSENTES_MAINTENUES' | 'DECISIONS'.
   */
  function simulerActif(e) {
    var choix;
    if (e.hypothese === 'DECISIONS') choix = choixAbsentes(e.decisions);
    else {
      choix = {};
      var valeur = e.hypothese === 'ABSENTES_ACCEPTEES' ? 'ACCEPTER' : 'REPORTER';
      e.comparaison.ecritures.forEach(function (ec) { if (ec.statut === 'ABSENTE') choix[ec.cle] = valeur; });
    }
    var sansCollision = { ecritures: e.comparaison.ecritures.filter(function (ec) { return ec.statut !== 'COLLISION'; }) };
    return construire({ base: e.base, comparaison: sansCollision, choix: choix, publication_id: 'SIMULATION', import_id: '', hasher: e.hasher }).actif;
  }

  /** Défait des mouvements : retire les lignes des écritures touchées et restaure les images avant. */
  function defaire(actif, mouvements) {
    var touchees = {};
    mouvements.forEach(function (m) { touchees[m.cle_ecriture] = true; });
    var restaurees = mouvements.filter(function (m) { return m.image_avant; }).map(function (m) { return copier(m.image_avant); });
    return actif.filter(function (l) { return !touchees[l.cle_ecriture]; }).concat(restaurees).sort(parUid);
  }

  // ------------------------------------------------------------------ empreinte de staging (A7)

  /**
   * empreinte_staging = H("staging", [import, client, périmètre, profil, règles, fichier, Lignes, Écritures,
   * Anomalies (statuts après décisions), Décisions, Total saisi]).
   */
  function empreinteStaging(e, hasher) {
    var res = e.resultat;
    var comp = res.comparaison || { ecritures: [], lignesRetenues: [], lignesIgnorees: [] };
    var lignes = comp.lignesRetenues.concat(comp.lignesIgnorees).slice().sort(function (a, b) { return a.source_rang - b.source_rang; })
      .map(function (l) {
        return E.H('ligne_staging', [l.source_rang, l.cle_ecriture, l.ligne_uid, l.retenue, l.statut_staging, l.journal_code,
          l.ecriture_num, l.ecriture_date, l.compte_num_source, l.h_fond, l.h_desc, l.h_let], hasher);
      });
    var ecritures = comp.ecritures.map(function (ec) {
      return E.H('ecriture_classee', [ec.cle, ec.bloc, ec.statut, ec.sous_types.join(','), ec.version_base, ec.reactivation,
        ec.h_ecr, ec.h_ecr_base], hasher);
    });
    var appliquees = Anomalies.appliquerDecisions(res.anomalies, e.decisions).anomalies;
    var anomalies = appliquees.slice().sort(function (a, b) { return E.comparerTexte(a.anomalie_id, b.anomalie_id); }).map(function (a) {
      return E.H('anomalie', [a.anomalie_id, a.code, a.gravite, a.statut, a.empreinte_objet, a.empreinte_derogation], hasher);
    });
    var decisions = (e.decisions || []).slice().sort(function (a, b) { return E.comparerTexte(a.decision_id, b.decision_id); }).map(function (d) {
      var cible = d.type === 'ABSENTE' ? d.cle : d.type === 'DEROGATION' ? d.anomalie_id : d.code + ':' + (d.anomalie_ids || []).join(',');
      return E.H('decision', [d.decision_id, d.type, cible, d.choix || '', d.motif || d.commentaire || '', d.reference || '',
        d.par, d.le, d.origine || '', d.source_decision_id || ''], hasher);
    });
    var ts = res.total_saisi;
    var hTs = ts ? E.H('total_saisi', [ts.debit_cts, ts.credit_cts, ts.debit_cts_confirmation, ts.credit_cts_confirmation,
      ts.nb_lignes === undefined ? null : ts.nb_lignes, ts.source || '', ts.saisi_par || '', ts.saisi_le || ''], hasher) : '';
    var p = res.perimetre;
    return E.H('staging', [res.import_id, res.client_id, p.exercice_id, p.du, p.au, res.profil_ref.profil_id, res.profil_ref.version,
      res.profil_ref.type, res.version_regles, res.file_sha256, E.Coll('staging_lignes', lignes, hasher),
      E.Coll('staging_ecritures', ecritures, hasher), E.Coll('staging_anomalies', anomalies, hasher),
      E.Coll('staging_decisions', decisions, hasher), hTs], hasher);
  }

  // ------------------------------------------------------------------ publication

  /**
   * @param {{base: object[], publications: object[], resultat: object, decisions: object[], validation: object,
   *          autre_import_en_cours?: boolean, publication_id: string, horodatage: string, hasher: object}} e
   * @returns {{ok: true, actif_suivant: object[], mouvements: object[], publication: object} |
   *           {ok: false, refus: string[], details: Object<string, *>}}
   */
  function planifierPublication(e) {
    E.verifierHasher(e.hasher);
    var refus = {};
    function refuser(code, detail) { refus[code] = detail === undefined ? true : detail; }
    var v = e.validation;
    var res = e.resultat;
    if (!v || v.decision !== 'VALIDE' || v.import_id !== res.import_id || v.client_id !== res.client_id
        || !v.valide_le || !v.soumis_le || v.valide_le < v.soumis_le) refuser('PUB_VALIDATION_ABSENTE');
    if (v && C.CHECKLIST.some(function (k) { return !(v.checklist && v.checklist[k] === true); })) refuser('PUB_CHECKLIST');
    if (e.autre_import_en_cours) refuser('PUB_IMPORT_EN_COURS');
    if (!res.comparaison) refuser('PUB_BND_OUVERT', 'import non analysé ou arrêté');

    var appli = Anomalies.appliquerDecisions(res.anomalies, e.decisions);
    var anomalies = appli.anomalies;
    appli.erreurs.forEach(function (x) { refuser(x.code, x.decision_id); });
    var ids = function (liste) { return liste.map(function (a) { return a.anomalie_id; }); };
    var bnd = anomalies.filter(function (a) { return a.gravite === 'BND'; });
    if (bnd.length) refuser('PUB_BND_OUVERT', ids(bnd));
    var bOuvertes = anomalies.filter(function (a) { return a.gravite === 'B' && a.statut !== 'DEROGEE'; });
    if (bOuvertes.length) refuser('PUB_B_NON_DEROGE', ids(bOuvertes));
    var aOuvertes = anomalies.filter(function (a) { return a.gravite === 'A' && a.statut !== 'ACQUITTEE'; });
    if (aOuvertes.length) refuser('PUB_A_NON_ACQUITTE', ids(aOuvertes));
    var choix = choixAbsentes(e.decisions);
    var sansDecision = res.comparaison ? res.comparaison.ecritures.filter(function (ec) {
      return ec.statut === 'ABSENTE' && choix[ec.cle] !== 'ACCEPTER' && choix[ec.cle] !== 'REPORTER';
    }) : [];
    if (sansDecision.length) refuser('PUB_ABSENTE_SANS_DECISION', sansDecision.map(function (ec) { return ec.cle; }));

    // A7 : revalidation des données et de leur version au moment de la publication.
    var checksumAvant = checksumActif(e.base, e.hasher);
    var version = versionActif(e.publications);
    if (v && (checksumAvant !== v.checksum_base || version !== v.version_base)) refuser('PUB_BASE_MODIFIEE');
    if (v && res.comparaison && empreinteStaging({ resultat: res, decisions: e.decisions }, e.hasher) !== v.empreinte_staging) refuser('PUB_STAGING_MODIFIE');

    var codes = Object.keys(refus).sort(E.comparerTexte);
    if (codes.length) return { ok: false, refus: codes, details: refus };

    var plan = construire({ base: e.base, comparaison: res.comparaison, choix: choix, publication_id: e.publication_id,
      import_id: res.import_id, hasher: e.hasher });
    if (!verifierPlan(e.base, plan, checksumAvant, e.hasher)) return { ok: false, refus: ['PUB_REC_PUBLICATION'], details: { PUB_REC_PUBLICATION: true } };

    var stats = statsActif(plan.actif);
    var parType = {};
    plan.mouvements.forEach(function (m) { parType[m.type] = (parType[m.type] || 0) + 1; });
    return {
      ok: true,
      actif_suivant: plan.actif,
      mouvements: plan.mouvements,
      publication: {
        publication_id: e.publication_id, type_pub: 'PUBLICATION', import_id: res.import_id, validation_id: v.validation_id,
        publication_precedente_id: version, annule_publication_id: '',
        checksum_avant: checksumAvant, checksum_apres: checksumActif(plan.actif, e.hasher),
        nb_lignes_avant: (e.base || []).length, nb_lignes_apres: stats.nb_lignes,
        sigma_debit_actives: stats.debit_cts, sigma_credit_actives: stats.credit_cts,
        nb_mouvements_par_type: parType, statut: 'PUBLIEE', annulee_par: '', horodatage: e.horodatage || '',
        derogations_retenues: (e.decisions || []).filter(function (d) { return d.type === 'DEROGATION'; }).map(copier)
      }
    };
  }

  /**
   * REC_PUBLICATION, avant toute bascule :
   * (a) chaque image avant existe dans la base avec la même empreinte ; chaque empreinte après correspond à l'actif suivant ;
   * (b) défaire les mouvements redonne exactement la base (réversibilité) ;
   * (c) Σ débit / crédit des lignes ACTIVE après = avant + Σ après − Σ avant.
   */
  function verifierPlan(base, plan, checksumAvant, hasher) {
    var baseParUid = {}, suivParUid = {};
    (base || []).forEach(function (l) { baseParUid[l.ligne_uid] = l; });
    plan.actif.forEach(function (l) { suivParUid[l.ligne_uid] = l; });
    var avant = statsActif(base), apres = statsActif(plan.actif);
    var d = avant.debit_cts, c = avant.credit_cts;
    for (var i = 0; i < plan.mouvements.length; i++) {
      var m = plan.mouvements[i];
      if (m.image_avant) {
        var b = baseParUid[m.ligne_uid];
        if (!b || Identite.hLigne(b, hasher) !== m.h_avant || Identite.hLigne(m.image_avant, hasher) !== m.h_avant) return false;
        if (b.statut === 'ACTIVE') { d -= b.debit_cts; c -= b.credit_cts; }
      }
      var s = suivParUid[m.ligne_uid];
      if ((s ? Identite.hLigne(s, hasher) : '') !== m.h_apres) return false;
      if (s && s.statut === 'ACTIVE') { d += s.debit_cts; c += s.credit_cts; }
    }
    if (d !== apres.debit_cts || c !== apres.credit_cts) return false;
    return checksumActif(defaire(plan.actif, plan.mouvements), hasher) === checksumAvant;
  }

  // ------------------------------------------------------------------ annulation (D8)

  /**
   * @param {{actif: object[], publications: object[], mouvements: object[], publication_id_annulee: string,
   *          import_en_cours?: boolean, tampon_inactif?: object[], publication_id: string, horodatage: string, hasher: object}} e
   */
  function planifierAnnulation(e) {
    E.verifierHasher(e.hasher);
    var refus = {};
    var pubs = e.publications || [];
    var p = pubs.filter(function (x) { return x.publication_id === e.publication_id_annulee; })[0];
    if (!p) return { ok: false, refus: ['ANN_PAS_DERNIERE'], details: {} };
    if (p.type_pub !== 'PUBLICATION') refus.ANN_TYPE = true;
    if (p.statut === 'ANNULEE') refus.ANN_DEJA_ANNULEE = true;
    if (versionActif(pubs) !== p.publication_id) refus.ANN_PAS_DERNIERE = true;
    if (e.import_en_cours) refus.ANN_IMPORT_EN_COURS = true;
    var courant = checksumActif(e.actif, e.hasher);
    if (courant !== p.checksum_apres) refus.ANN_ACTIF_ALTERE = true;
    var codes = Object.keys(refus).sort(E.comparerTexte);
    if (codes.length) return { ok: false, refus: codes, details: refus };

    var propres = (e.mouvements || []).filter(function (m) { return m.publication_id === p.publication_id; });
    var restaure = defaire(e.actif, propres);
    var stats = statsActif(restaure);
    var checksumRestaure = checksumActif(restaure, e.hasher);
    if (checksumRestaure !== p.checksum_avant || stats.nb_lignes !== p.nb_lignes_avant) return { ok: false, refus: ['ANN_VERIFICATION'], details: {} };
    if (e.tampon_inactif && checksumActif(e.tampon_inactif, e.hasher) !== checksumRestaure) return { ok: false, refus: ['ANN_TAMPON_DIVERGENT'], details: {} };

    var avantParUid = {}, restParUid = {};
    e.actif.forEach(function (l) { avantParUid[l.ligne_uid] = l; });
    restaure.forEach(function (l) { restParUid[l.ligne_uid] = l; });
    var mouvements = propres.slice().sort(function (x, y) { return E.comparerTexte(x.mouvement_id, y.mouvement_id); }).map(function (m, i) {
      var a = avantParUid[m.ligne_uid], b = restParUid[m.ligne_uid];
      return {
        mouvement_id: e.publication_id + ':' + ('00000' + (i + 1)).slice(-6), publication_id: e.publication_id,
        type_pub: 'ANNULATION', import_id: p.import_id, ligne_uid: m.ligne_uid, cle_ecriture: m.cle_ecriture,
        type: 'ANNULATION', sous_types: [], version_avant: a ? a.version : 0, version_apres: b ? b.version : 0,
        h_avant: a ? Identite.hLigne(a, e.hasher) : '', h_apres: b ? Identite.hLigne(b, e.hasher) : '',
        image_avant: a ? copier(a) : null, annule_mouvement_id: m.mouvement_id
      };
    });
    var annulee = copier(p);
    annulee.statut = 'ANNULEE';
    annulee.annulee_par = e.publication_id;
    return {
      ok: true,
      actif_restaure: restaure,
      mouvements_inverses: mouvements,
      publication_annulee: annulee,
      publication_annulation: {
        publication_id: e.publication_id, type_pub: 'ANNULATION', import_id: p.import_id, validation_id: '',
        publication_precedente_id: p.publication_id, annule_publication_id: p.publication_id,
        checksum_avant: courant, checksum_apres: checksumRestaure,
        nb_lignes_avant: e.actif.length, nb_lignes_apres: stats.nb_lignes,
        sigma_debit_actives: stats.debit_cts, sigma_credit_actives: stats.credit_cts,
        nb_mouvements_par_type: { ANNULATION: mouvements.length }, statut: 'PUBLIEE', annulee_par: '',
        horodatage: e.horodatage || '', derogations_retenues: []
      }
    };
  }

  return {
    versionActif: versionActif,
    checksumActif: checksumActif,
    statsActif: statsActif,
    simulerActif: simulerActif,
    defaire: defaire,
    empreinteStaging: empreinteStaging,
    planifierPublication: planifierPublication,
    planifierAnnulation: planifierAnnulation
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte'),
  typeof Identite !== 'undefined' ? Identite : require('./identite'),
  typeof Anomalies !== 'undefined' ? Anomalies : require('./anomalies')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Publication;
