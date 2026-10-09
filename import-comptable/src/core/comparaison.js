/**
 * Classification des écritures du fichier par rapport à l'actif, dans le périmètre déclaré (contrat §4.6).
 * Unité de comparaison : l'écriture entière (A8), par multiensembles triés d'empreintes.
 */
var Comparaison = (function (C, E, Identite) {
  'use strict';

  var S = C.STATUTS;

  /** Vrai si un import publié et non annulé du client porte ce file_sha256. */
  function detecterReimport(fileSha256, imports) {
    return (imports || []).some(function (i) { return i.file_sha256 === fileSha256 && i.statut === 'PUBLIE'; });
  }

  /**
   * @param {{base: object[], lignes: object[], perimetre: object, profil: object, client_id: string, hasher: object}} e
   * @returns {{ecritures: object[], lignesRetenues: object[], lignesIgnorees: object[], compteurs: object}}
   */
  function classer(e) {
    var hasher = e.hasher;
    var p = e.perimetre;
    (e.base || []).concat(e.lignes).forEach(function (l) {
      if (l.client_id !== e.client_id) throw C.erreurContrat('CLIENT_INCOHERENT', 'client_id');
    });
    e.lignes.forEach(function (l) { if (l.exercice_id !== p.exercice_id) throw C.erreurContrat('PERIMETRE_INVALIDE', 'exercice_id'); });

    var fichier = regrouperFichier(e.lignes, hasher);
    var base = regrouperBase(e.base, p.exercice_id, hasher);
    var contigu = e.profil.contiguite_ecritures !== false;
    var ecritures = [];
    var retenues = [];
    var ignorees = [];
    var parStatut = {};
    Object.keys(S).forEach(function (k) { parStatut[k] = 0; });
    var parSousType = { M_FOND: 0, M_DATE: 0, M_DESC: 0, M_LET: 0 };

    Object.keys(fichier).sort(E.comparerTexte).forEach(function (cle) {
      var blocs = fichier[cle];
      var toutes = [].concat.apply([], blocs);
      var ec = enTete(cle, toutes[0]);
      var dates = distinctes(toutes.map(function (l) { return l.ecriture_date; }));
      var precedente = base[cle] || [];

      var retenu = toutes;
      var motif = dates.length > 1 ? 'DATES_MULTIPLES' : '';
      if (!motif && contigu && blocs.length > 1) {
        var sig0 = signature(blocs[0]);
        if (blocs.every(function (b) { return signature(b) === sig0; })) {
          retenu = blocs[0];
          for (var k = 1; k < blocs.length; k++) {
            ignorees.push.apply(ignorees, blocs[k].map(function (l) { return marquer(l, false, S.DOUBLON_INTRA); }));
            ecritures.push(blocIgnore(cle, blocs[k], k + 1));
            parStatut.DOUBLON_INTRA++;
          }
        } else {
          motif = 'BLOCS_DIFFERENTS';
        }
      }
      if (motif) {
        ec.statut = S.COLLISION;
        ec.motif = motif;
        ec.lignes = toutes.map(function (l) { return marquer(l, true, S.COLLISION); });
        ec.rangs = toutes.map(function (l) { return l.source_rang; });
        // Lignes en collision : en staging (comptées comme importées), import bloqué par IDN_COLLISION.
        retenues.push.apply(retenues, ec.lignes);
        parStatut.COLLISION++;
        ecritures.push(ec);
        return;
      }

      var actives = precedente.filter(function (l) { return l.statut === 'ACTIVE'; });
      ec.version_base = precedente.reduce(function (v, l) { return Math.max(v, l.version || 0); }, 0);
      ec.ligne_uids_base = precedente.map(function (l) { return l.ligne_uid; }).sort(E.comparerTexte);
      ec.validee_fichier = retenu.some(function (l) { return l.valid_date !== ''; });
      if (!actives.length) {
        ec.statut = S.NOUVELLE;
        ec.reactivation = precedente.length > 0;
      } else {
        ec.lignes_base = actives;
        ec.ecriture_date_base = actives[0].ecriture_date;
        ec.validee_base = actives.some(function (l) { return l.valid_date !== ''; });
        ec.h_ecr_base = Identite.hEcriture(actives, hasher);
        ec.sous_types = sousTypes(actives, retenu);
        ec.statut = ec.sous_types.length ? S.MODIFIEE : S.INCHANGEE;
        ec.sous_types.forEach(function (s) { parSousType[s]++; });
      }
      ec.lignes = Identite.attribuerLigneUid(retenu).map(function (l) { return marquer(l, true, ec.statut); });
      ec.rangs = retenu.map(function (l) { return l.source_rang; });
      ec.h_ecr = Identite.hEcriture(ec.lignes, hasher);
      retenues.push.apply(retenues, ec.lignes);
      parStatut[ec.statut]++;
      ecritures.push(ec);
    });

    var enPerimetre = 0;
    Object.keys(base).sort(E.comparerTexte).forEach(function (cle) {
      var actives = base[cle].filter(function (l) { return l.statut === 'ACTIVE'; });
      if (!actives.length || !dansPerimetre(actives[0], p)) return;
      enPerimetre++;
      if (fichier[cle]) return;
      var ec = enTete(cle, actives[0]);
      ec.statut = S.ABSENTE;
      ec.bloc = 0;
      ec.lignes_base = actives;
      ec.ecriture_date_base = actives[0].ecriture_date;
      ec.version_base = actives.reduce(function (v, l) { return Math.max(v, l.version || 0); }, 0);
      ec.ligne_uids_base = actives.map(function (l) { return l.ligne_uid; }).sort(E.comparerTexte);
      ec.validee_base = actives.some(function (l) { return l.valid_date !== ''; });
      ec.h_ecr_base = Identite.hEcriture(actives, hasher);
      ec.aide = ec.validee_base ? '' : 'PROBABLEMENT_VALIDEE_SOUS_NOUVEAU_NUMERO';
      parStatut.ABSENTE++;
      ecritures.push(ec);
    });

    ecritures.sort(function (a, b) { return a.cle !== b.cle ? E.comparerTexte(a.cle, b.cle) : a.bloc - b.bloc; });
    return {
      ecritures: ecritures,
      lignesRetenues: retenues,
      lignesIgnorees: ignorees,
      compteurs: {
        par_statut: parStatut,
        par_sous_type: parSousType,
        ecritures_fichier: Object.keys(fichier).length,
        lignes_retenues: retenues.length,
        lignes_doublons_ignorees: ignorees.length,
        ecritures_base_perimetre: enPerimetre
      }
    };
  }

  function enTete(cle, l) {
    return {
      cle: cle, exercice_id: l.exercice_id, journal_code: l.journal_code, ecriture_num: l.ecriture_num,
      statut: '', sous_types: [], bloc: 1, rangs: [], ligne_uids_base: [],
      ecriture_date: l.ecriture_date, ecriture_date_base: '', version_base: 0,
      validee_base: false, validee_fichier: false, reactivation: false, h_ecr: '', h_ecr_base: '', aide: '', motif: '',
      lignes: [], lignes_base: []
    };
  }

  function blocIgnore(cle, lignes, numero) {
    var ec = enTete(cle, lignes[0]);
    ec.statut = S.DOUBLON_INTRA;
    ec.bloc = numero;
    ec.rangs = lignes.map(function (l) { return l.source_rang; });
    return ec;
  }

  function marquer(l, retenue, statut) {
    var c = {};
    Object.keys(l).forEach(function (k) { c[k] = l[k]; });
    c.retenue = retenue;
    c.statut_staging = statut;
    if (c.ligne_uid === undefined) c.ligne_uid = '';
    return c;
  }

  /** Regroupe les lignes du fichier par clé, en blocs de lignes consécutives (ordre des rangs). */
  function regrouperFichier(lignes, hasher) {
    var parCle = {};
    var precedente = null;
    lignes.slice().sort(function (a, b) { return a.source_rang - b.source_rang; }).forEach(function (l) {
      var c = completer(l, hasher);
      var blocs = parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = []);
      if (precedente !== l.cle_ecriture || !blocs.length) blocs.push([]);
      blocs[blocs.length - 1].push(c);
      precedente = l.cle_ecriture;
    });
    return parCle;
  }

  function regrouperBase(actif, exerciceId, hasher) {
    var parCle = {};
    (actif || []).forEach(function (l) {
      if (l.exercice_id !== exerciceId) return;
      (parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = [])).push(completer(l, hasher));
    });
    return parCle;
  }

  /** Recalcule les empreintes depuis les champs : on ne fait jamais confiance aux empreintes stockées. */
  function completer(l, hasher) {
    var c = {};
    Object.keys(l).forEach(function (k) { c[k] = l[k]; });
    var h = Identite.empreintes(l, hasher);
    c.h_fond = h.h_fond; c.h_desc = h.h_desc; c.h_let = h.h_let;
    return c;
  }

  function dansPerimetre(l, p) {
    return l.exercice_id === p.exercice_id && l.ecriture_date >= p.du && l.ecriture_date <= p.au;
  }

  function multi(lignes, f) { return lignes.map(f).sort(E.comparerTexte).join('\n'); }
  function tf(l) { return l.h_fond; }
  function tfd(l) { return l.h_fond + '|' + l.h_desc; }
  function tfdl(l) { return l.h_fond + '|' + l.h_desc + '|' + l.h_let; }
  function signature(lignes) { return lignes[0].ecriture_date + '\n' + multi(lignes, tfdl); }

  function sousTypes(base, fichier) {
    var types = [];
    var memeDate = base[0].ecriture_date === fichier[0].ecriture_date;
    if (memeDate && multi(base, tfdl) === multi(fichier, tfdl)) return types;
    var fondDiffere = multi(base, tf) !== multi(fichier, tf);
    if (fondDiffere) types.push('M_FOND');
    if (!memeDate) types.push('M_DATE');
    if (!fondDiffere) {
      if (multi(base, tfd) !== multi(fichier, tfd)) types.push('M_DESC');
      else if (multi(base, tfdl) !== multi(fichier, tfdl)) types.push('M_LET');
    }
    return types;
  }

  function distinctes(valeurs) {
    var vues = {};
    return valeurs.filter(function (v) { if (vues[v]) return false; vues[v] = true; return true; });
  }

  return {
    detecterReimport: detecterReimport,
    classer: classer,
    dansPerimetre: dansPerimetre
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte'),
  typeof Identite !== 'undefined' ? Identite : require('./identite')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Comparaison;
