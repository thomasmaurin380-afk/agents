/**
 * Contrôles essentiels du MVP (§17, contrat §6) : produisent des anomalies et des résultats de contrôle,
 * ne modifient rien. Les contrôles indépendants (A6) n'utilisent ni parseMontant ni parseDate.
 */
var Controles = (function (C, E, Anomalies, Comparaison) {
  'use strict';

  var A = Anomalies.creer;

  /**
   * Contrôles préalables, avant toute lecture du contenu et avant la détection de réimport.
   *
   * P6 — identité de la société : un FEC n'est jamais rejeté sur le seul nom du fichier.
   * Sources examinées : dossier de dépôt (adaptateur), SIREN déclaré par l'opérateur, SIREN du nom FEC.
   * - une source fiable qui désigne un autre client → CLI_MISMATCH (BND) ;
   * - aucune confirmation par le dossier ou la déclaration → CLI_IDENTITE_NON_CONFIRMEE (B, motivée) ;
   * - FEC dont le nom ne suit pas SIRENFECAAAAMMJJ → CLI_NOM_FEC_NON_CONFORME (A).
   * A4 — un exercice déjà alimenté par une autre source → PRF_CHANGEMENT (BND) ; type dérivé de l'actif.
   *
   * @param {{client: object, profil: object, nomFichier: string, perimetre: object, actif: object[],
   *          identite?: {dossier_client_id?: string, siren_declare?: string}}} c
   */
  function controlesPrealables(c) {
    var anomalies = [];
    var id = c.identite || {};
    var contradictions = [];
    var confirmations = 0;
    if (id.dossier_client_id) {
      if (id.dossier_client_id !== c.client.client_id) contradictions.push('DOSSIER');
      else confirmations++;
    }
    if (id.siren_declare) {
      if (id.siren_declare !== c.client.siren) contradictions.push('SIREN_DECLARE');
      else confirmations++;
    }
    var m = /^(\d{9})FEC(\d{8})/i.exec(c.nomFichier || '');
    if (m && m[1] !== c.client.siren) contradictions.push('SIREN_NOM_FICHIER');
    if (contradictions.length) {
      anomalies.push(A('CLI_MISMATCH', { objet_cle: contradictions.join(','), attendu: c.client.siren, obtenu: m ? m[1] : '',
        message: 'source(s) désignant un autre client : ' + contradictions.join(', ') }));
    } else if (!confirmations) {
      anomalies.push(A('CLI_IDENTITE_NON_CONFIRMEE', { message: 'ni le dossier de dépôt ni une déclaration ne confirment le client' }));
    }
    if (c.profil.type === 'FEC' && !m) {
      anomalies.push(A('CLI_NOM_FEC_NON_CONFORME', { message: 'nom de fichier FEC non conforme (SIRENFECAAAAMMJJ)' }));
    }
    var types = {};
    (c.actif || []).forEach(function (l) { if (l.exercice_id === c.perimetre.exercice_id) types[l.source_type] = true; });
    var autres = Object.keys(types).filter(function (t) { return t !== c.profil.type; });
    if (autres.length) {
      anomalies.push(A('PRF_CHANGEMENT', { objet_type: 'EXERCICE', objet_cle: c.perimetre.exercice_id, attendu: autres.join(','),
        obtenu: c.profil.type, message: 'mélange de sources interdit : passer par une migration contrôlée (A4)' }));
    }
    return anomalies;
  }

  /**
   * @param {{client: object, profil: object, perimetre: object, lecture: object, comparaison: object|null,
   *          base: object[], actif_simule: object[]|null, total_saisi?: object}} ctx
   * @returns {{controles: object[], anomalies: object[], variations: object[]}}
   */
  function executerControles(ctx) {
    var controles = [];
    var anomalies = [];
    var lecture = ctx.lecture;
    function controle(id, attendu, obtenu, ok) {
      controles.push({ control_id: id, control_version: C.VERSION_REGLES, attendu: String(attendu), obtenu: String(obtenu),
        ecart: ok ? '' : 'ECART', ok: ok });
      return ok;
    }

    // --- Structure : encodage, en-tête, rejets (A2 : une seule anomalie REJ_LIGNES, détaillée par motif)
    var vus = {};
    lecture.anomaliesStructure.forEach(function (s) {
      var cle = s.code + '|' + s.motif + '|' + s.colonne;
      if (vus[cle]) return;
      vus[cle] = true;
      anomalies.push(A(s.code, { objet_cle: s.motif + (s.colonne ? '|' + s.colonne : ''), message: s.colonne }));
    });
    if (lecture.structure_ok && lecture.rejets.length) {
      var parMotif = {};
      lecture.rejets.forEach(function (r) {
        var t = parMotif[r.motif] || (parMotif[r.motif] = []);
        if (t.indexOf(r.rang) === -1) t.push(r.rang);
      });
      var motifs = Object.keys(parMotif).sort(E.comparerTexte);
      anomalies.push(A('REJ_LIGNES', { nb: lecture.lignesRejetees.length, rangs: lecture.lignesRejetees, obtenu: lecture.lignesRejetees.length,
        message: motifs.map(function (k) { return k + ' : ' + parMotif[k].join(','); }).join(' ; ') }));
    }
    if (!lecture.structure_ok || !ctx.comparaison) return { controles: controles, anomalies: trier(anomalies), variations: [] };

    var comp = ctx.comparaison;
    var cpt = lecture.compteurs;
    var exercice = ctx.client.exercices.filter(function (x) { return x.id === ctx.perimetre.exercice_id; })[0];
    var cloture = exercice.statut === 'CLOTURE';

    // --- C4 / REC_LIGNES : lignes physiques recomptées indépendamment, aucune ligne perdue
    var okLignes = controle('REC_LIGNES', 'lues = retenues + rejetées + vides + doublons ignorés',
      JSON.stringify({ physiques: cpt.lignes_physiques, couvertes: cpt.lignes_couvertes, lues: cpt.lues, retenues: comp.compteurs.lignes_retenues,
        rejetees: cpt.rejetees, vides: cpt.vides, doublons: comp.compteurs.lignes_doublons_ignorees }),
      cpt.lignes_physiques === cpt.lignes_couvertes && cpt.lues === cpt.normalisees + cpt.rejetees + cpt.vides
        && cpt.normalisees === comp.compteurs.lignes_retenues + comp.compteurs.lignes_doublons_ignorees);
    if (!okLignes) anomalies.push(A('REC_LIGNES', { obtenu: controles[controles.length - 1].obtenu }));

    // --- C5 / REC_TOTAUX : totaux recalculés sur les chaînes brutes par un parseur minimal distinct
    var bruts = totauxBruts(lecture.montants_bruts, ctx.profil);
    var recalc = somme(lecture.lignes);
    var okTotaux = controle('REC_TOTAUX', JSON.stringify(bruts), JSON.stringify(lecture.totaux),
      bruts.debit_cts === lecture.totaux.debit_cts && bruts.credit_cts === lecture.totaux.credit_cts
        && recalc.debit_cts === lecture.totaux.debit_cts && recalc.credit_cts === lecture.totaux.credit_cts);
    if (!okTotaux) anomalies.push(A('REC_TOTAUX', { attendu: JSON.stringify(bruts), obtenu: JSON.stringify(lecture.totaux) }));

    // --- C7 / REC_MIROIR : actif simulé (ABSENTES acceptées) restreint au périmètre = lignes retenues du fichier
    if (ctx.actif_simule) {
      var miroir = verifierMiroir(ctx.actif_simule, comp, ctx.perimetre);
      if (!controle('REC_MIROIR', miroir.attendu, miroir.obtenu, miroir.ok)) {
        anomalies.push(A('REC_MIROIR', { attendu: miroir.attendu, obtenu: miroir.obtenu, cles: miroir.comptes }));
      }
    }

    // --- C6 / équilibre
    var total = lecture.totaux;
    var okGlobal = controle('EQU_GLOBAL', total.debit_cts, total.credit_cts, total.debit_cts === total.credit_cts);
    if (!okGlobal) {
      anomalies.push(A('EQU_GLOBAL', { gravite: ctx.profil.type === 'GL' ? 'B' : 'BND', attendu: total.debit_cts,
        obtenu: total.credit_cts, ecart: total.debit_cts - total.credit_cts }));
    }
    comp.ecritures.forEach(function (ec) {
      if (ec.statut === 'COLLISION' || ec.statut === 'DOUBLON_INTRA' || ec.statut === 'ABSENTE') return;
      var s = somme(ec.lignes);
      if (s.debit_cts !== s.credit_cts) {
        anomalies.push(A('EQU_ECRITURE', { objet_type: 'ECRITURE', objet_cle: ec.cle, attendu: s.debit_cts, obtenu: s.credit_cts,
          ecart: s.debit_cts - s.credit_cts }));
      }
    });

    // --- A6 / P2 : total logiciel obligatoire pour un grand livre (C1 double saisie, C2 écart, C3 absence).
    // Non rapproché s'il existe des lignes rejetées (REJ_LIGNES bloque déjà ; l'écart serait mécanique).
    var ts = ctx.total_saisi;
    if (!lecture.rejets.length) {
      if (ts) {
        var confirme = ts.debit_cts_confirmation === undefined
          || (ts.debit_cts_confirmation === ts.debit_cts && ts.credit_cts_confirmation === ts.credit_cts);
        if (!controle('REC_TOTAL_SAISI_CONFIRMATION', 'double saisie identique', confirme ? 'identique' : 'différente', confirme)) {
          anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'SAISIE_NON_CONFIRMEE' }));
        }
        var attenduTs = JSON.stringify({ debit_cts: ts.debit_cts, credit_cts: ts.credit_cts });
        if (!controle('REC_TOTAL_SAISI', attenduTs, JSON.stringify(total), ts.debit_cts === total.debit_cts && ts.credit_cts === total.credit_cts)) {
          anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'ECART', attendu: attenduTs, obtenu: JSON.stringify(total),
            ecart: (total.debit_cts - ts.debit_cts) + '/' + (total.credit_cts - ts.credit_cts) }));
        }
        if (typeof ts.nb_lignes === 'number' && !controle('REC_TOTAL_SAISI_LIGNES', ts.nb_lignes, cpt.normalisees, ts.nb_lignes === cpt.normalisees)) {
          anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'NB_LIGNES', attendu: ts.nb_lignes, obtenu: cpt.normalisees }));
        }
      } else if (ctx.profil.type === 'GL') {
        controle('REC_TOTAL_SAISI', 'total saisi', 'absent', false);
        anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'TOTAL_ABSENT', message: 'total du logiciel obligatoire pour un grand livre (P2)' }));
      }
    }

    // --- Périmètre et comptes
    if (lecture.horsPerimetre.length) {
      anomalies.push(A('PER_HORS_PERIMETRE', { nb: lecture.horsPerimetre.length, rangs: lecture.horsPerimetre,
        attendu: ctx.perimetre.du + '/' + ctx.perimetre.au }));
    }
    var sourcesBase = {};
    (ctx.base || []).forEach(function (l) {
      if (l.statut !== 'ACTIVE') return;
      var compact = String(l.compte_num_source || '').replace(/[ .\-]/g, '').toUpperCase();
      var t = sourcesBase[l.compte_num] || (sourcesBase[l.compte_num] = []);
      if (compact && t.indexOf(compact) === -1) t.push(compact);
    });
    Object.keys(lecture.comptesSources).sort(E.comparerTexte).forEach(function (compte) {
      var sources = lecture.comptesSources[compte].slice();
      (sourcesBase[compte] || []).forEach(function (s) { if (sources.indexOf(s) === -1) sources.push(s); });
      if (sources.length > 1) {
        anomalies.push(A('CPT_COLLISION_PADDING', { objet_type: 'COMPTE', objet_cle: compte, obtenu: sources.sort(E.comparerTexte).join(',') }));
      }
      if (!/^[1-8]/.test(compte)) anomalies.push(A('CPT_CLASSE', { objet_type: 'COMPTE', objet_cle: compte }));
    });

    // --- Identification
    var absentes = 0;
    var parCleDoublons = {};
    comp.ecritures.forEach(function (ec) { if (ec.statut === 'DOUBLON_INTRA') parCleDoublons[ec.cle] = (parCleDoublons[ec.cle] || 0) + 1; });
    var modDesc = [], modLet = [], reapp = [];
    comp.ecritures.forEach(function (ec) {
      var o = { objet_type: 'ECRITURE', objet_cle: ec.cle };
      if (ec.statut === 'COLLISION') anomalies.push(A('IDN_COLLISION', ext(o, { message: ec.motif, rangs: ec.rangs })));
      if (ec.statut === 'ABSENTE') {
        absentes++;
        // P5 : sur exercice clôturé, une seule anomalie B, levée par une décision ABSENTE motivée (validation renforcée).
        anomalies.push(A('IDN_ABSENTE', ext(o, { gravite: cloture ? 'B' : 'A', mention: cloture ? 'EXERCICE_CLOTURE' : '', message: ec.aide })));
        return;
      }
      if (ec.statut === 'DOUBLON_INTRA') return;
      if (parCleDoublons[ec.cle] && ec.bloc === 1) anomalies.push(A('IDN_DOUBLON_INTRA', ext(o, { nb: parCleDoublons[ec.cle] })));
      if (ec.statut === 'MODIFIEE') {
        if (ec.sous_types.indexOf('M_FOND') !== -1 || ec.sous_types.indexOf('M_DATE') !== -1) {
          anomalies.push(A('IDN_MOD_FOND', ext(o, { mention: ec.validee_base ? 'VALIDEE' : '', obtenu: ec.sous_types.join(',') })));
        } else if (ec.sous_types.indexOf('M_DESC') !== -1) modDesc.push(ec.cle);
        else if (ec.sous_types.indexOf('M_LET') !== -1) modLet.push(ec.cle);
        if (ec.validee_base && !ec.validee_fichier) anomalies.push(A('IDN_DEVALIDEE', o));
      }
      if (ec.statut === 'NOUVELLE' && ec.reactivation) reapp.push(ec.cle);
      var surCloture = ec.statut === 'NOUVELLE' || (ec.statut === 'MODIFIEE' && !(ec.sous_types.length === 1 && ec.sous_types[0] === 'M_LET'));
      if (cloture && surCloture) anomalies.push(A('PER_CLOTURE', ext(o, { obtenu: ec.statut })));
    });
    var seuils = ctx.client.seuils || {};
    var pct = seuils.suppr_masse_pct === undefined ? 5 : seuils.suppr_masse_pct;
    var nbMax = seuils.suppr_masse_nb === undefined ? 50 : seuils.suppr_masse_nb;
    var base = comp.compteurs.ecritures_base_perimetre;
    var massif = absentes > 0 && (absentes * 100 > pct * base || absentes > nbMax);
    controle('VOL_SUPPR_MASSE', '<= ' + pct + ' % et <= ' + nbMax, absentes + '/' + base, !massif);
    if (massif) anomalies.push(A('VOL_SUPPR_MASSE', { attendu: '<= ' + pct + ' % et <= ' + nbMax, obtenu: absentes + '/' + base, nb: absentes }));

    // --- Informations (agrégées)
    if (modDesc.length) anomalies.push(A('IDN_MOD_DESC', { nb: modDesc.length, cles: modDesc }));
    if (modLet.length) anomalies.push(A('IDN_MOD_LET', { nb: modLet.length, cles: modLet }));
    if (reapp.length) anomalies.push(A('IDN_REAPPARITION', { nb: reapp.length, cles: reapp }));
    var infos = lecture.infos;
    if (infos.montants_nuls.length) anomalies.push(A('MNT_NUL', { nb: infos.montants_nuls.length, rangs: infos.montants_nuls }));
    if (infos.montants_negatifs.length) anomalies.push(A('MNT_NEG', { nb: infos.montants_negatifs.length, rangs: infos.montants_negatifs }));
    if (infos.decimales_nulles.length) anomalies.push(A('MNT_DECIMALES_NULLES', { nb: infos.decimales_nulles.length, rangs: infos.decimales_nulles }));
    if (infos.a_neutraliser.length) anomalies.push(A('SEC_NEUTRALISE', { nb: infos.a_neutraliser.length, rangs: infos.a_neutraliser }));

    return {
      controles: controles,
      anomalies: trier(anomalies),
      variations: ctx.actif_simule ? variationsSoldes(ctx.base, ctx.actif_simule) : []
    };
  }

  function trier(anomalies) {
    return anomalies.slice().sort(function (a, b) { return E.comparerTexte(a.anomalie_id, b.anomalie_id); });
  }

  function ext(base, plus) {
    var o = {};
    Object.keys(base).forEach(function (k) { o[k] = base[k]; });
    Object.keys(plus).forEach(function (k) { o[k] = plus[k]; });
    return o;
  }

  /**
   * Totaux recalculés depuis les chaînes brutes, sans Normalisation.parseMontant (contrôle indépendant A6).
   * Règle minimale : chiffres et séparateur décimal conservés ; négatif si « - » ou « ( » ; deux décimales.
   * P3 : chaque montant reste dans sa colonne, signe compris.
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
      if (profil.mode_sens === 'DEBIT_CREDIT') { debit += cts(m.debit); credit += cts(m.credit); return; }
      var sens = String(m.sens || '').trim().toUpperCase();
      var estD = profil.valeurs_sens.D.some(function (v) { return String(v).toUpperCase() === sens; });
      if (estD) debit += cts(m.montant); else credit += cts(m.montant);
    });
    return { debit_cts: debit, credit_cts: credit };
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

  function verifierMiroir(actifSimule, comp, perimetre) {
    var actives = actifSimule.filter(function (l) { return l.statut === 'ACTIVE' && Comparaison.dansPerimetre(l, perimetre); });
    var fichier = comp.lignesRetenues.filter(function (l) { return Comparaison.dansPerimetre(l, perimetre); });
    var sa = somme(actives), sf = somme(fichier);
    var ca = soldesParCompte(actives), cf = soldesParCompte(fichier);
    var comptes = Object.keys(ca).concat(Object.keys(cf)).filter(function (v, i, t) { return t.indexOf(v) === i; });
    var ecarts = comptes.filter(function (k) { return (ca[k] || 0) !== (cf[k] || 0); }).sort(E.comparerTexte);
    return {
      ok: actives.length === fichier.length && sa.debit_cts === sf.debit_cts && sa.credit_cts === sf.credit_cts && !ecarts.length,
      attendu: JSON.stringify({ lignes: fichier.length, debit: sf.debit_cts, credit: sf.credit_cts }),
      obtenu: JSON.stringify({ lignes: actives.length, debit: sa.debit_cts, credit: sa.credit_cts }),
      comptes: ecarts
    };
  }

  /**
   * Variations de solde par compte sur l'exercice : [{compte, avant_cts, apres_cts, delta_cts}],
   * deltas non nuls, triés par |delta| décroissant puis par compte.
   */
  function variationsSoldes(base, actifSimule) {
    var avant = soldesParCompte((base || []).filter(function (l) { return l.statut === 'ACTIVE'; }));
    var apres = soldesParCompte((actifSimule || []).filter(function (l) { return l.statut === 'ACTIVE'; }));
    var comptes = Object.keys(avant).concat(Object.keys(apres)).filter(function (v, i, t) { return t.indexOf(v) === i; });
    return comptes.map(function (k) {
      return { compte: k, avant_cts: avant[k] || 0, apres_cts: apres[k] || 0, delta_cts: (apres[k] || 0) - (avant[k] || 0) };
    }).filter(function (v) { return v.delta_cts !== 0; }).sort(function (a, b) {
      var d = Math.abs(b.delta_cts) - Math.abs(a.delta_cts);
      return d !== 0 ? d : E.comparerTexte(a.compte, b.compte);
    });
  }

  return {
    controlesPrealables: controlesPrealables,
    executerControles: executerControles,
    totauxBruts: totauxBruts,
    soldesParCompte: soldesParCompte,
    variationsSoldes: variationsSoldes
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte'),
  typeof Anomalies !== 'undefined' ? Anomalies : require('./anomalies'),
  typeof Comparaison !== 'undefined' ? Comparaison : require('./comparaison')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Controles;
