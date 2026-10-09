/**
 * Plan de publication et d'annulation, en mémoire.
 *
 * L'actif n'est jamais modifié sur place : on construit un nouvel actif et la liste des
 * mouvements. Chaque mouvement « AVANT » porte l'image complète de la ligne remplacée,
 * ce qui permet le retour arrière par reconstruction (D8).
 */
var Publication = (function (Modele, Identite) {
  'use strict';

  var SEP = '\u001F';

  // ---------------------------------------------------------------- empreintes

  function hacher(prefixe, contenu, hasher) {
    return Modele.VERSION_EMPREINTE + ':' + hasher.sha256Hex(prefixe + SEP + contenu);
  }

  function comparerUid(a, b) { return a.ligne_uid < b.ligne_uid ? -1 : a.ligne_uid > b.ligne_uid ? 1 : 0; }

  /**
   * Checksum de l'actif : indépendant de l'ordre de stockage (tri par ligne_uid).
   * @returns {{checksum: string, nb_lignes: number, nb_actives: number, debit_cts: number, credit_cts: number}}
   */
  function checksumActif(actif, hasher) {
    var lignes = (actif || []).slice().sort(comparerUid);
    var nbActives = 0, debit = 0, credit = 0;
    var parties = lignes.map(function (l) {
      if (l.statut === 'ACTIVE') { nbActives++; debit += l.debit_cts; credit += l.credit_cts; }
      return [l.ligne_uid, String(l.version), l.statut, Identite.empreinteLigne(l, hasher)].join(SEP);
    });
    return {
      checksum: hacher('ACTIF', parties.join('\n'), hasher),
      nb_lignes: lignes.length,
      nb_actives: nbActives,
      debit_cts: debit,
      credit_cts: credit
    };
  }

  /**
   * Empreinte de staging : classification + contenu des lignes retenues + décisions.
   * Figée à la validation, recalculée à la publication (A7).
   */
  function empreinteStaging(comparaison, decisions, anomalies, hasher) {
    decisions = decisions || {};
    var parties = comparaison.ecritures.map(function (e) {
      var lignes = e.lignes.map(function (l) { return Identite.empreinteLigne(l, hasher); }).sort();
      return [e.cle, e.statut, e.sous_types.join(','), String(e.doublons_ignores), decisions[e.cle] || ''].concat(lignes).join(SEP);
    });
    var anos = (anomalies || []).map(function (a) {
      return [a.anomalie_id, a.gravite, a.attendu, a.obtenu, a.empreinte_derogation].join(SEP);
    }).sort();
    return hacher('STAGING', parties.join('\n') + '\n--\n' + anos.join('\n'), hasher);
  }

  // ---------------------------------------------------------------- construction

  function ordreCanonique(a, b) {
    var cles = ['compte_num', 'comp_aux_num', 'debit_cts', 'credit_cts', 'h_desc', 'h_let', 'source_rang'];
    for (var i = 0; i < cles.length; i++) {
      var x = a[cles[i]], y = b[cles[i]];
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  }

  function versActive(ligne, cle, k, version, contexte, premierImport, hasher) {
    var a = {};
    Modele.CHAMPS_LIGNE.forEach(function (c) { a[c] = ligne[c]; });
    a.montant_cts = ligne.debit_cts - ligne.credit_cts;
    a.ligne_uid = cle + '#' + k;
    a.version = version;
    a.statut = 'ACTIVE';
    a.first_import_id = premierImport || contexte.import_id;
    a.source_import_id = contexte.import_id;
    a.source_rang = ligne.source_rang;
    a.last_publication_id = contexte.publication_id;
    var h = Identite.empreintes(a, hasher);
    a.h_fond = h.h_fond; a.h_desc = h.h_desc; a.h_let = h.h_let;
    return a;
  }

  function copier(l) {
    var c = {};
    Object.keys(l).forEach(function (k) { c[k] = l[k]; });
    return c;
  }

  /**
   * Construit le nouvel actif sans aucune vérification (utilisé aussi pour la simulation REC_MIROIR).
   * @param {{actif: object[], comparaison: object, decisions: Object<string, string>,
   *          import_id: string, publication_id: string, hasher: object}} e
   * @returns {{actif: object[], mouvements: object[]}}
   */
  function construireActif(e) {
    var decisions = e.decisions || {};
    var parCle = {};
    (e.actif || []).forEach(function (l) { (parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = [])).push(l); });
    var mouvements = [];
    var seq = 0;
    function mouvement(nature, sens, cle, ligne, versionAvant, versionApres) {
      seq++;
      var m = {
        mouvement_id: e.publication_id + '-' + seq,
        publication_id: e.publication_id,
        type_pub: e.type_pub || 'PUBLICATION',
        import_id: e.import_id || '',
        cle_ecriture: cle,
        nature: nature,
        sens: sens,
        ligne_uid: ligne.ligne_uid,
        version_avant: versionAvant,
        version_apres: versionApres,
        statut: ligne.statut,
        debit_cts: ligne.debit_cts,
        credit_cts: ligne.credit_cts,
        h_ligne: Identite.empreinteLigne(ligne, e.hasher)
      };
      if (sens === 'AVANT') m.avant = copier(ligne);
      mouvements.push(m);
    }

    e.comparaison.ecritures.forEach(function (ec) {
      var cle = ec.cle;
      var precedentes = parCle[cle] || [];
      var versionAvant = precedentes.reduce(function (v, l) { return Math.max(v, l.version); }, 0);
      if (ec.statut === 'NOUVELLE' || ec.statut === 'MODIFIEE') {
        var nature = ec.statut === 'NOUVELLE' ? 'INSERTION'
          : (ec.sous_types.length === 1 && ec.sous_types[0] === 'M_LET' ? 'LETTRAGE' : 'MODIFICATION');
        var premier = precedentes.length ? precedentes[0].first_import_id : '';
        precedentes.forEach(function (l) { mouvement(nature, 'AVANT', cle, l, versionAvant, versionAvant + 1); });
        var nouvelles = ec.lignes.slice().sort(ordreCanonique).map(function (l, i) {
          return versActive(l, cle, i + 1, versionAvant + 1, e, premier, e.hasher);
        });
        nouvelles.forEach(function (l) { mouvement(nature, 'APRES', cle, l, versionAvant, versionAvant + 1); });
        parCle[cle] = nouvelles;
      } else if (ec.statut === 'ABSENTE' && decisions[cle] === 'ACCEPTER') {
        var supprimees = precedentes.map(function (l) {
          var s = copier(l);
          s.statut = 'SUPPRIMEE_SOURCE';
          s.version = versionAvant + 1;
          s.last_publication_id = e.publication_id;
          return s;
        });
        precedentes.forEach(function (l) { mouvement('SUPPRESSION_LOGIQUE', 'AVANT', cle, l, versionAvant, versionAvant + 1); });
        supprimees.forEach(function (l) { mouvement('SUPPRESSION_LOGIQUE', 'APRES', cle, l, versionAvant, versionAvant + 1); });
        parCle[cle] = supprimees;
      } else if (ec.statut === 'COLLISION') {
        throw new Error('construireActif: écriture en collision ' + cle);
      }
    });

    var actif = [];
    Object.keys(parCle).sort().forEach(function (cle) { Array.prototype.push.apply(actif, parCle[cle]); });
    actif.sort(comparerUid);
    return { actif: actif, mouvements: mouvements };
  }

  /** Vérifie, indépendamment de la construction, que actif N = actif N-1 + mouvements (REC_PUBLICATION). */
  function verifierMouvements(avant, apres, mouvements) {
    var nb = avant.nb_lignes, d = avant.debit_cts, c = avant.credit_cts;
    mouvements.forEach(function (m) {
      var signe = m.sens === 'APRES' ? 1 : -1;
      nb += signe;
      if (m.statut === 'ACTIVE') { d += signe * m.debit_cts; c += signe * m.credit_cts; }
    });
    return nb === apres.nb_lignes && d === apres.debit_cts && c === apres.credit_cts;
  }

  /**
   * Défait une publication : retire les lignes des écritures touchées et restaure les images « AVANT ».
   * Sert au retour arrière (D8) et à la preuve de réversibilité avant publication (REC_PUBLICATION).
   */
  function reconstruire(actif, mouvementsPublication) {
    var touchees = {};
    mouvementsPublication.forEach(function (m) { touchees[m.cle_ecriture] = true; });
    var conservees = actif.filter(function (l) { return !touchees[l.cle_ecriture]; });
    var restaurees = mouvementsPublication.filter(function (m) { return m.sens === 'AVANT'; }).map(function (m) { return copier(m.avant); });
    return {
      actif: conservees.concat(restaurees).sort(comparerUid),
      retirees: actif.filter(function (l) { return touchees[l.cle_ecriture]; }),
      restaurees: restaurees
    };
  }

  // ---------------------------------------------------------------- validation et publication

  function cleAnomalie(a) { return a.code + '|' + a.objet_cle; }

  /**
   * Prépare la validation : fige l'empreinte du staging et la version de l'actif de base (A7).
   */
  function preparerValidation(e) {
    return {
      empreinte_staging: empreinteStaging(e.comparaison, e.decisions, e.anomalies, e.hasher),
      checksum_base: checksumActif(e.actif, e.hasher).checksum,
      version_base: e.version_base || '',
      decisions: copier(e.decisions || {}),
      derogations: (e.derogations || []).map(copier),
      acquittements: (e.acquittements || []).slice(),
      checklist: copier(e.checklist || {}),
      valide_par: e.valide_par || '',
      valide_le: e.valide_le || ''
    };
  }

  var CHECKLIST = ['fichier_plus_recent', 'variations_expliquees', 'decisions_revues'];
  var MOTIF_MIN = 20;

  /**
   * @param {{actif: object[], comparaison: object, anomalies: object[], validation: object,
   *          import_id: string, publication_id: string, version_base?: string, hasher: object}} e
   * @returns {{ok: true, actif: object[], mouvements: object[], publication: object} |
   *           {ok: false, code: string, details: *}}
   */
  function planifierPublication(e) {
    var v = e.validation;
    if (!v) return refus('VALIDATION_ABSENTE');
    var refusListe = [];
    var anomalies = e.anomalies || [];
    var parId = {};
    anomalies.forEach(function (a) { parId[a.anomalie_id] = a; });

    if (CHECKLIST.some(function (k) { return !(v.checklist && v.checklist[k] === true); })) refusListe.push({ code: 'CHECKLIST_INCOMPLETE' });

    var bnd = anomalies.filter(function (a) { return a.gravite === 'BND'; });
    if (bnd.length) refusListe.push({ code: 'ANOMALIE_BND', details: bnd.map(function (a) { return a.anomalie_id; }) });

    var derogees = {};
    var invalides = [];
    (v.derogations || []).forEach(function (d) {
      var a = parId[d.anomalie_id];
      var motif = String(d.motif || '').trim();
      if (!a || a.gravite !== 'B' || a.empreinte_derogation !== d.empreinte_derogation || motif.length < MOTIF_MIN || !d.par) {
        invalides.push(d.anomalie_id);
      } else {
        derogees[d.anomalie_id] = true;
      }
    });
    if (invalides.length) refusListe.push({ code: 'DEROGATION_INVALIDE', details: invalides });
    var bNonDerogees = anomalies.filter(function (a) { return a.gravite === 'B' && !derogees[a.anomalie_id]; });
    if (bNonDerogees.length) refusListe.push({ code: 'BLOQUANT_NON_DEROGE', details: bNonDerogees.map(function (a) { return a.anomalie_id; }) });

    var acquittes = {};
    (v.acquittements || []).forEach(function (id) { acquittes[id] = true; });
    var decisionsAbsentes = v.decisions || {};
    var aNonAcquittes = anomalies.filter(function (a) {
      if (a.gravite !== 'A' || acquittes[a.anomalie_id]) return false;
      // Une décision explicite sur une ABSENTE vaut acquittement de son IDN_ABSENTE (A).
      return !(a.code === 'IDN_ABSENTE' && decisionsAbsentes[a.objet_cle]);
    });
    if (aNonAcquittes.length) refusListe.push({ code: 'AVERTISSEMENT_NON_ACQUITTE', details: aNonAcquittes.map(function (a) { return a.anomalie_id; }) });

    var sansDecision = e.comparaison.ecritures.filter(function (ec) {
      var d = decisionsAbsentes[ec.cle];
      return ec.statut === 'ABSENTE' && d !== 'ACCEPTER' && d !== 'REPORTER';
    });
    if (sansDecision.length) refusListe.push({ code: 'DECISION_MANQUANTE', details: sansDecision.map(function (ec) { return ec.cle; }) });

    // A7 : revalidation des données et de leur version au moment de la publication.
    var avant = checksumActif(e.actif, e.hasher);
    if (avant.checksum !== v.checksum_base || (v.version_base || '') !== (e.version_base || '')) {
      refusListe.push({ code: 'VERSION_BASE_MODIFIEE', details: { checksum: avant.checksum, version: e.version_base || '' } });
    }
    var staging = empreinteStaging(e.comparaison, v.decisions, anomalies, e.hasher);
    if (staging !== v.empreinte_staging) refusListe.push({ code: 'STAGING_MODIFIE' });

    if (refusListe.length) return { ok: false, code: refusListe[0].code, details: refusListe[0].details || null, refus: refusListe };

    var plan = construireActif({
      actif: e.actif, comparaison: e.comparaison, decisions: v.decisions,
      import_id: e.import_id, publication_id: e.publication_id, hasher: e.hasher
    });
    var apres = checksumActif(plan.actif, e.hasher);
    if (!verifierMouvements(avant, apres, plan.mouvements)) return refus('REC_PUBLICATION', 'TOTAUX');
    // Preuve de réversibilité avant bascule : défaire les mouvements redonne exactement l'actif de base.
    if (checksumActif(reconstruire(plan.actif, plan.mouvements).actif, e.hasher).checksum !== avant.checksum) {
      return refus('REC_PUBLICATION', 'REVERSIBILITE');
    }

    return {
      ok: true,
      actif: plan.actif,
      mouvements: plan.mouvements,
      publication: {
        publication_id: e.publication_id,
        type_pub: 'PUBLICATION',
        import_id: e.import_id,
        version_base: e.version_base || '',
        checksum_avant: avant.checksum,
        checksum_apres: apres.checksum,
        nb_lignes: apres.nb_lignes,
        nb_actives: apres.nb_actives,
        debit_cts: apres.debit_cts,
        credit_cts: apres.credit_cts
      }
    };
  }

  /**
   * Retour arrière de la publication N par reconstruction depuis ses mouvements (D8).
   * @param {{actif: object[], mouvements: object[], publication: object,
   *          publication_annulation_id: string, hasher: object}} e
   *   `mouvements` : mouvements de la publication N uniquement.
   */
  function planifierAnnulation(e) {
    var pub = e.publication;
    var courant = checksumActif(e.actif, e.hasher);
    if (courant.checksum !== pub.checksum_apres) {
      return refus('ACTIF_DIFFERENT_DE_N', { attendu: pub.checksum_apres, obtenu: courant.checksum });
    }
    var propres = e.mouvements.filter(function (m) { return m.publication_id === pub.publication_id; });
    var r = reconstruire(e.actif, propres);
    var actif = r.actif, retirees = r.retirees, restaurees = r.restaurees;

    var reconstruit = checksumActif(actif, e.hasher);
    if (reconstruit.checksum !== pub.checksum_avant) {
      return refus('RECONSTRUCTION_DIVERGENTE', { attendu: pub.checksum_avant, obtenu: reconstruit.checksum });
    }

    var id = e.publication_annulation_id;
    var seq = 0;
    function inverse(sens, l) {
      seq++;
      var m = {
        mouvement_id: id + '-' + seq, publication_id: id, type_pub: 'ANNULATION', import_id: pub.import_id,
        cle_ecriture: l.cle_ecriture, nature: 'ANNULATION', sens: sens, ligne_uid: l.ligne_uid,
        version_avant: '', version_apres: '', statut: l.statut, debit_cts: l.debit_cts, credit_cts: l.credit_cts,
        h_ligne: Identite.empreinteLigne(l, e.hasher)
      };
      if (sens === 'AVANT') m.avant = copier(l);
      return m;
    }
    var mouvements = retirees.map(function (l) { return inverse('AVANT', l); })
      .concat(restaurees.map(function (l) { return inverse('APRES', l); }));

    return {
      ok: true,
      actif: actif,
      mouvements: mouvements,
      publication: {
        publication_id: id,
        type_pub: 'ANNULATION',
        annule: pub.publication_id,
        import_id: pub.import_id,
        checksum_avant: courant.checksum,
        checksum_apres: reconstruit.checksum,
        nb_lignes: reconstruit.nb_lignes,
        nb_actives: reconstruit.nb_actives,
        debit_cts: reconstruit.debit_cts,
        credit_cts: reconstruit.credit_cts
      }
    };
  }

  function refus(code, details) {
    var d = details === undefined ? null : details;
    return { ok: false, code: code, details: d, refus: [{ code: code, details: d }] };
  }

  return {
    checksumActif: checksumActif,
    empreinteStaging: empreinteStaging,
    construireActif: construireActif,
    verifierMouvements: verifierMouvements,
    reconstruire: reconstruire,
    preparerValidation: preparerValidation,
    planifierPublication: planifierPublication,
    planifierAnnulation: planifierAnnulation
  };
})(
  typeof Modele !== 'undefined' ? Modele : require('./modele'),
  typeof Identite !== 'undefined' ? Identite : require('./identite')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Publication;
