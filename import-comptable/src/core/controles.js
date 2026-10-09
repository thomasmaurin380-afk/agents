/**
 * Contrôles essentiels du MVP (§17) : produisent des anomalies, ne modifient rien.
 */
var Controles = (function (Anomalies, Comparaison) {
  'use strict';

  var A = Anomalies.creer;

  /**
   * Contrôles préalables, avant toute lecture du contenu et avant la détection de réimport :
   * fichier du bon client (CLI_MISMATCH) et source cohérente avec l'exercice (PRF_CHANGEMENT, A4).
   * @param {{client: object, profil: object, nomFichier: string, perimetre: object, typeProfilExercice?: string}} c
   */
  function controlesPrealables(c) {
    var anomalies = [];
    if (c.profil.type === 'FEC') {
      var m = /^(\d{9})FEC(\d{8})/i.exec(c.nomFichier || '');
      if (!m) {
        anomalies.push(A('CLI_MISMATCH', { message: 'nom de fichier FEC non conforme (SIRENFECAAAAMMJJ)', obtenu: c.nomFichier }));
      } else if (m[1] !== c.client.siren) {
        anomalies.push(A('CLI_MISMATCH', { message: 'SIREN du fichier différent du client', attendu: c.client.siren, obtenu: m[1] }));
      }
    }
    if (c.typeProfilExercice && c.typeProfilExercice !== c.profil.type) {
      anomalies.push(A('PRF_CHANGEMENT', {
        objet_type: 'EXERCICE', objet_cle: c.perimetre.exercice_id,
        attendu: c.typeProfilExercice, obtenu: c.profil.type,
        message: 'mélange de sources interdit : passer par une migration contrôlée (A4)'
      }));
    }
    return anomalies;
  }

  /**
   * Contrôles de structure, applicables même quand le fichier n'est pas interprétable.
   * @param {{lecture: object}} c
   */
  function controlesStructure(c) {
    var anomalies = [];
    var vus = {};
    c.lecture.anomaliesStructure.forEach(function (s) {
      var cle = s.code + '|' + s.message;
      if (vus[cle]) return;
      vus[cle] = true;
      anomalies.push(A(s.code, { message: s.message }));
    });

    // Une seule anomalie REJ_LIGNES par import (A2 : toute ligne rejetée bloque), détaillée par motif.
    if (c.lecture.structureValide && c.lecture.rejets.length) {
      var parMotif = {};
      c.lecture.rejets.forEach(function (r) {
        r.codes.forEach(function (code) {
          var motif = code.split(':')[0];
          var t = parMotif[motif] || (parMotif[motif] = []);
          if (t.indexOf(r.rang) === -1) t.push(r.rang);
        });
      });
      var motifs = Object.keys(parMotif).sort();
      anomalies.push(A('REJ_LIGNES', {
        obtenu: c.lecture.rejets.length,
        message: c.lecture.rejets.length + ' ligne(s) rejetée(s) : ' + motifs.join(', '),
        details: { rangs: c.lecture.rejets.map(function (r) { return r.rang; }), par_motif: parMotif }
      }));
    }
    return anomalies;
  }

  /**
   * Contrôles après classification.
   * @param {{client: object, profil: object, perimetre: object, lecture: object, comparaison: object,
   *          actif: object[], actifSimule: object[], totalSaisi?: {debit_cts: number, credit_cts: number}}} c
   */
  function controlesContenu(c) {
    var anomalies = [];
    var lecture = c.lecture;
    var comp = c.comparaison;
    var exercice = c.client.exercices.filter(function (e) { return e.id === c.perimetre.exercice_id; })[0];
    var cloture = exercice.statut === 'CLOTURE';

    // --- Réconciliations
    var cpt = lecture.compteurs;
    var importees = comp.lignesConservees.length;
    if (cpt.lignes_physiques !== cpt.lignes_couvertes
        || cpt.lues !== cpt.valides + cpt.rejetees + cpt.vides
        || cpt.valides !== importees + comp.lignesDoublonsIgnorees) {
      anomalies.push(A('REC_LIGNES', {
        attendu: 'lues = importées + rejetées + vides + doublons ignorés',
        obtenu: JSON.stringify({ physiques: cpt.lignes_physiques, couvertes: cpt.lignes_couvertes, lues: cpt.lues,
          valides: cpt.valides, rejetees: cpt.rejetees, vides: cpt.vides, importees: importees,
          doublons: comp.lignesDoublonsIgnorees })
      }));
    }
    // REC_TOTAUX : totaux recalculés sur les chaînes brutes par un parseur minimal distinct de parseMontant (A6),
    // et sur les lignes normalisées ; les trois doivent concorder.
    var bruts = totauxBruts(lecture.montantsBruts, c.profil);
    var recalc = somme(lecture.lignes);
    if (bruts.debit_cts !== lecture.totauxLecture.debit_cts || bruts.credit_cts !== lecture.totauxLecture.credit_cts
        || recalc.debit_cts !== lecture.totauxLecture.debit_cts || recalc.credit_cts !== lecture.totauxLecture.credit_cts) {
      anomalies.push(A('REC_TOTAUX', { attendu: JSON.stringify(bruts), obtenu: JSON.stringify(lecture.totauxLecture) }));
    }
    if (c.actifSimule) {
      var miroir = verifierMiroir(c.actifSimule, comp, c.perimetre);
      if (miroir) anomalies.push(A('REC_MIROIR', miroir));
    }

    // --- Équilibre
    var total = lecture.totauxLecture;
    if (total.debit_cts !== total.credit_cts) {
      anomalies.push(A('EQU_GLOBAL', {
        gravite: c.profil.type === 'GL' ? 'B' : 'BND',
        attendu: total.debit_cts, obtenu: total.credit_cts, message: 'écart ' + (total.debit_cts - total.credit_cts) + ' cts'
      }));
    }
    comp.ecritures.forEach(function (e) {
      if (!e.lignes.length || e.statut === 'COLLISION') return;
      var s = somme(e.lignes);
      if (s.debit_cts !== s.credit_cts) {
        anomalies.push(A('EQU_ECRITURE', { objet_type: 'ECRITURE', objet_cle: e.cle, attendu: s.debit_cts, obtenu: s.credit_cts }));
      }
    });

    // --- Total logiciel (A6) : accepté temporairement, ne remplace pas les contrôles indépendants ci-dessus.
    // Le total logiciel n'est rapproché que si toutes les lignes ont été interprétées
    // (sinon REJ_LIGNES bloque déjà et l'écart serait mécanique).
    var ts = c.totalSaisi;
    if (lecture.rejets.length) {
      // rien
    } else if (ts) {
      var confirme = ts.debit_cts_confirmation === undefined
        || (ts.debit_cts_confirmation === ts.debit_cts && ts.credit_cts_confirmation === ts.credit_cts);
      if (!confirme) {
        anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'SAISIE_NON_CONFIRMEE', message: 'double saisie du total discordante' }));
      }
      if (ts.debit_cts !== total.debit_cts || ts.credit_cts !== total.credit_cts) {
        anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'ECART', attendu: JSON.stringify({ debit_cts: ts.debit_cts, credit_cts: ts.credit_cts }), obtenu: JSON.stringify(total) }));
      }
      if (typeof ts.nb_lignes === 'number' && ts.nb_lignes !== cpt.valides) {
        anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'NB_LIGNES', attendu: ts.nb_lignes, obtenu: cpt.valides }));
      }
    } else if (c.profil.type === 'GL') {
      anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'TOTAL_ABSENT', message: 'total du logiciel non saisi pour un grand livre' }));
    }

    // --- Périmètre et comptes
    if (lecture.horsPerimetre.length) {
      anomalies.push(A('PER_HORS_PERIMETRE', {
        objet_type: 'LIGNES', obtenu: lecture.horsPerimetre.length,
        attendu: c.perimetre.du + ' → ' + c.perimetre.au, details: { rangs: lecture.horsPerimetre }
      }));
    }
    var sourcesBase = {};
    (c.actif || []).forEach(function (l) {
      if (l.statut !== 'ACTIVE' || !l.compte_num_source) return;
      var t = sourcesBase[l.compte_num] || (sourcesBase[l.compte_num] = []);
      if (t.indexOf(l.compte_num_source) === -1) t.push(l.compte_num_source);
    });
    Object.keys(lecture.comptesSources).sort().forEach(function (compte) {
      var sources = lecture.comptesSources[compte].concat((sourcesBase[compte] || []).filter(function (s) {
        return lecture.comptesSources[compte].indexOf(s) === -1;
      }));
      if (sources.length > 1) {
        anomalies.push(A('CPT_COLLISION_PADDING', { objet_type: 'COMPTE', objet_cle: compte, obtenu: sources.slice().sort().join(', ') }));
      }
      if (!/^[1-8]/.test(compte)) anomalies.push(A('CPT_CLASSE', { objet_type: 'COMPTE', objet_cle: compte }));
    });

    // --- Identification
    var absentes = 0;
    comp.ecritures.forEach(function (e) {
      var o = { objet_type: 'ECRITURE', objet_cle: e.cle };
      if (e.statut === 'COLLISION') anomalies.push(A('IDN_COLLISION', ext(o, { message: e.motif })));
      if (e.doublons_ignores) anomalies.push(A('IDN_DOUBLON_INTRA', ext(o, { obtenu: e.doublons_ignores })));
      if (e.statut === 'ABSENTE') {
        absentes++;
        anomalies.push(A('IDN_ABSENTE', ext(o, {
          message: e.base_validee ? '' : 'écriture en brouillard : peut-être validée sous un nouveau numéro (voir les NOUVELLES de même journal et date)'
        })));
      }
      if (e.statut === 'MODIFIEE') {
        if (e.sous_types.indexOf('M_FOND') !== -1 || e.sous_types.indexOf('M_DATE') !== -1) {
          anomalies.push(A('IDN_MOD_FOND', ext(o, { message: e.base_validee ? 'écriture validée modifiée' : '', obtenu: e.sous_types.join(',') })));
        } else if (e.sous_types.indexOf('M_DESC') !== -1) {
          anomalies.push(A('IDN_MOD_DESC', o));
        } else if (e.sous_types.indexOf('M_LET') !== -1) {
          anomalies.push(A('IDN_MOD_LET', o));
        }
        if (e.devalidee) anomalies.push(A('IDN_DEVALIDEE', o));
      }
      if (e.statut === 'NOUVELLE' && e.reapparition) anomalies.push(A('IDN_REAPPARITION', o));
      var mouvementSurCloture = e.statut === 'NOUVELLE' || e.statut === 'ABSENTE'
        || (e.statut === 'MODIFIEE' && !(e.sous_types.length === 1 && e.sous_types[0] === 'M_LET'));
      if (cloture && mouvementSurCloture) anomalies.push(A('PER_CLOTURE', ext(o, { obtenu: e.statut })));
    });
    var enPerimetre = ecrituresBaseEnPerimetre(c.actif, c.perimetre);
    var seuils = c.client.seuils || {};
    if (absentes && enPerimetre && (absentes * 100 > (seuils.suppr_masse_pct || 5) * enPerimetre || absentes > (seuils.suppr_masse_nb || 50))) {
      anomalies.push(A('VOL_SUPPR_MASSE', { attendu: '≤ ' + (seuils.suppr_masse_pct || 5) + ' % et ≤ ' + (seuils.suppr_masse_nb || 50), obtenu: absentes + ' / ' + enPerimetre }));
    }

    // --- Informations
    if (lecture.infos.montants_nuls) anomalies.push(A('MNT_NUL', { obtenu: lecture.infos.montants_nuls }));
    if (lecture.infos.montants_negatifs) anomalies.push(A('MNT_NEG', { obtenu: lecture.infos.montants_negatifs }));
    if (lecture.infos.a_neutraliser) anomalies.push(A('SEC_NEUTRALISE', { obtenu: lecture.infos.a_neutraliser }));

    return anomalies;
  }

  /**
   * Totaux recalculés depuis les chaînes brutes, sans passer par Normalisation.parseMontant (contrôle indépendant A6).
   * Règle minimale : on garde chiffres et séparateur décimal ; négatif si « - » ou « ( » ; deux décimales.
   */
  function totauxBruts(montantsBruts, profil) {
    var dec = profil.decimal;
    function cts(s) {
      s = String(s || '');
      var negatif = s.indexOf('-') !== -1 || s.indexOf('(') !== -1;
      var garde = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if ((ch >= '0' && ch <= '9') || ch === dec) garde += ch;
      }
      var pos = garde.lastIndexOf(dec);
      var ent = pos === -1 ? garde : garde.slice(0, pos);
      var fra = pos === -1 ? '' : garde.slice(pos + 1);
      var v = Number(ent || '0') * 100 + Number((fra + '00').slice(0, 2));
      return negatif ? -v : v;
    }
    var debit = 0, credit = 0;
    (montantsBruts || []).forEach(function (m) {
      var signe;
      if (profil.mode_sens === 'DEBIT_CREDIT') signe = cts(m.debit) - cts(m.credit);
      else {
        var sens = String(m.sens || '').trim().toUpperCase();
        var estD = profil.valeurs_sens.D.some(function (v) { return String(v).toUpperCase() === sens; });
        signe = estD ? cts(m.montant) : -cts(m.montant);
      }
      if (signe > 0) debit += signe; else credit -= signe;
    });
    return { debit_cts: debit, credit_cts: credit };
  }

  function ext(base, plus) {
    var o = {};
    Object.keys(base).forEach(function (k) { o[k] = base[k]; });
    Object.keys(plus).forEach(function (k) { o[k] = plus[k]; });
    return o;
  }

  function somme(lignes) {
    var d = 0, c = 0;
    lignes.forEach(function (l) { d += l.debit_cts; c += l.credit_cts; });
    return { debit_cts: d, credit_cts: c };
  }

  function soldesParCompte(lignes) {
    var s = {};
    lignes.forEach(function (l) { s[l.compte_num] = (s[l.compte_num] || 0) + l.debit_cts - l.credit_cts; });
    return s;
  }

  function ecrituresBaseEnPerimetre(actif, perimetre) {
    var cles = {};
    (actif || []).forEach(function (l) {
      if (l.statut === 'ACTIVE' && Comparaison.dansPerimetre(l, perimetre)) cles[l.cle_ecriture] = true;
    });
    return Object.keys(cles).length;
  }

  /**
   * REC_MIROIR : après fusion simulée (ABSENTES supposées acceptées), l'actif restreint au périmètre
   * doit refléter exactement les lignes retenues du fichier situées dans le périmètre.
   */
  function verifierMiroir(actifSimule, comp, perimetre) {
    var actives = actifSimule.filter(function (l) { return l.statut === 'ACTIVE' && Comparaison.dansPerimetre(l, perimetre); });
    var fichier = comp.lignesConservees.filter(function (l) { return Comparaison.dansPerimetre(l, perimetre); });
    var sa = somme(actives), sf = somme(fichier);
    var ca = soldesParCompte(actives), cf = soldesParCompte(fichier);
    var comptes = Object.keys(ca).concat(Object.keys(cf)).filter(function (v, i, t) { return t.indexOf(v) === i; });
    var ecarts = comptes.filter(function (k) { return (ca[k] || 0) !== (cf[k] || 0); });
    if (actives.length === fichier.length && sa.debit_cts === sf.debit_cts && sa.credit_cts === sf.credit_cts && !ecarts.length) return null;
    return {
      attendu: JSON.stringify({ lignes: fichier.length, debit: sf.debit_cts, credit: sf.credit_cts }),
      obtenu: JSON.stringify({ lignes: actives.length, debit: sa.debit_cts, credit: sa.credit_cts }),
      details: { comptes_en_ecart: ecarts.sort() }
    };
  }

  /** Variation de solde par compte (actif simulé − actif courant), comptes en écart seulement. */
  function variationsSoldes(actif, actifSimule) {
    var avant = soldesParCompte((actif || []).filter(function (l) { return l.statut === 'ACTIVE'; }));
    var apres = soldesParCompte((actifSimule || []).filter(function (l) { return l.statut === 'ACTIVE'; }));
    var v = {};
    Object.keys(avant).concat(Object.keys(apres)).forEach(function (k) {
      var d = (apres[k] || 0) - (avant[k] || 0);
      if (d !== 0) v[k] = d;
    });
    var trie = {};
    Object.keys(v).sort().forEach(function (k) { trie[k] = v[k]; });
    return trie;
  }

  return {
    controlesPrealables: controlesPrealables,
    controlesStructure: controlesStructure,
    controlesContenu: controlesContenu,
    variationsSoldes: variationsSoldes,
    totauxBruts: totauxBruts,
    soldesParCompte: soldesParCompte
  };
})(
  typeof Anomalies !== 'undefined' ? Anomalies : require('./anomalies'),
  typeof Comparaison !== 'undefined' ? Comparaison : require('./comparaison')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Controles;
