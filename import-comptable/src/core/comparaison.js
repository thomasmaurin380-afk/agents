/**
 * Classification des écritures du fichier par rapport à l'actif, dans le périmètre déclaré.
 *
 * Unité de comparaison : l'écriture entière (A8). Pas d'appariement ligne à ligne :
 * on compare des multiensembles triés d'empreintes (fond ; fond+desc ; fond+desc+let).
 */
var Comparaison = (function (Modele, Identite) {
  'use strict';

  var S = Modele.STATUTS;
  var T = Modele.SOUS_TYPES;

  /**
   * @param {{actif: object[], lignes: object[], perimetre: object, profil: object,
   *          hasher: {sha256Hex: function(string): string}}} entree
   *   `actif` : lignes actives publiées (statut ACTIVE ou SUPPRIMEE_SOURCE) ;
   *   `lignes` : lignes canoniques valides issues de la lecture.
   * @returns {{ecritures: object[], compteurs: Object<string, number>, lignesConservees: object[],
   *            lignesDoublonsIgnorees: number}}
   */
  function classer(entree) {
    var hasher = entree.hasher;
    var perimetre = entree.perimetre;
    var contigu = entree.profil.contiguite_ecritures !== false;

    var fichier = regrouperFichier(entree.lignes, hasher);
    var base = regrouperBase(entree.actif, hasher);

    var ecritures = [];
    var lignesConservees = [];
    var lignesDoublonsIgnorees = 0;
    var compteurs = {};
    Object.keys(S).forEach(function (k) { compteurs[k] = 0; });

    Object.keys(fichier).sort().forEach(function (cle) {
      var blocs = fichier[cle];
      var toutes = [].concat.apply([], blocs);
      var e = enTete(cle, toutes[0]);

      var dates = distinctes(toutes.map(function (l) { return l.ecriture_date; }));
      if (dates.length > 1) return collision(e, toutes, 'DATES_MULTIPLES');

      var retenues = toutes;
      if (contigu && blocs.length > 1) {
        var signature0 = signature(blocs[0]);
        var identiques = blocs.every(function (b) { return signature(b) === signature0; });
        if (!identiques) return collision(e, toutes, 'BLOCS_DIFFERENTS');
        retenues = blocs[0];
        e.doublons_ignores = blocs.length - 1;
        compteurs.DOUBLON_INTRA += blocs.length - 1;
        for (var b = 1; b < blocs.length; b++) lignesDoublonsIgnorees += blocs[b].length;
      }
      e.lignes = retenues;
      Array.prototype.push.apply(lignesConservees, retenues);

      var precedente = base[cle];
      var actives = precedente ? precedente.filter(estActive) : [];
      if (!actives.length) {
        e.statut = S.NOUVELLE;
        e.reapparition = !!(precedente && precedente.length);
      } else {
        e.lignes_base = actives;
        e.base_validee = actives.some(function (l) { return l.valid_date !== ''; });
        e.devalidee = e.base_validee && retenues.every(function (l) { return l.valid_date === ''; });
        e.sous_types = sousTypes(actives, retenues);
        e.statut = e.sous_types.length ? S.MODIFIEE : S.INCHANGEE;
      }
      compteurs[e.statut]++;
      ecritures.push(e);
    });

    Object.keys(base).sort().forEach(function (cle) {
      if (fichier[cle]) return;
      var actives = base[cle].filter(estActive);
      if (!actives.length || !dansPerimetre(actives[0], perimetre)) return;
      var e = enTete(cle, actives[0]);
      e.statut = S.ABSENTE;
      e.lignes_base = actives;
      e.base_validee = actives.some(function (l) { return l.valid_date !== ''; });
      compteurs.ABSENTE++;
      ecritures.push(e);
    });

    ecritures.sort(function (a, b) { return a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0; });
    return {
      ecritures: ecritures,
      compteurs: compteurs,
      lignesConservees: lignesConservees,
      lignesDoublonsIgnorees: lignesDoublonsIgnorees
    };

    function collision(e, toutes, motif) {
      e.statut = S.COLLISION;
      e.motif = motif;
      e.lignes = toutes;
      // Les lignes en collision restent en staging (import bloqué par IDN_COLLISION) : elles comptent comme importées.
      Array.prototype.push.apply(lignesConservees, toutes);
      compteurs.COLLISION++;
      ecritures.push(e);
    }
  }

  function enTete(cle, ligne) {
    return {
      cle: cle,
      journal_code: ligne.journal_code,
      ecriture_num: ligne.ecriture_num,
      ecriture_date: ligne.ecriture_date,
      exercice_id: ligne.exercice_id,
      statut: '',
      sous_types: [],
      doublons_ignores: 0,
      lignes: [],
      lignes_base: [],
      base_validee: false,
      devalidee: false,
      reapparition: false,
      motif: ''
    };
  }

  /** Regroupe les lignes du fichier par clé, en blocs de lignes contiguës (ordre du fichier). */
  function regrouperFichier(lignes, hasher) {
    var parCle = {};
    var precedente = null;
    lignes.slice().sort(function (a, b) { return a.source_rang - b.source_rang; }).forEach(function (l) {
      var avecEmpreintes = completer(l, hasher);
      var blocs = parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = []);
      if (precedente !== l.cle_ecriture || !blocs.length) blocs.push([]);
      blocs[blocs.length - 1].push(avecEmpreintes);
      precedente = l.cle_ecriture;
    });
    return parCle;
  }

  function regrouperBase(actif, hasher) {
    var parCle = {};
    (actif || []).forEach(function (l) {
      (parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = [])).push(completer(l, hasher));
    });
    return parCle;
  }

  /** Recalcule les empreintes à partir des champs (ne fait jamais confiance aux empreintes stockées). */
  function completer(ligne, hasher) {
    var copie = {};
    Object.keys(ligne).forEach(function (k) { copie[k] = ligne[k]; });
    var h = Identite.empreintes(ligne, hasher);
    copie.h_fond = h.h_fond;
    copie.h_desc = h.h_desc;
    copie.h_let = h.h_let;
    return copie;
  }

  function estActive(l) { return l.statut === undefined || l.statut === 'ACTIVE'; }

  function dansPerimetre(ligne, p) {
    return ligne.exercice_id === p.exercice_id && ligne.ecriture_date >= p.du && ligne.ecriture_date <= p.au;
  }

  function multiensemble(lignes, f) {
    return lignes.map(f).sort().join('\n');
  }
  function tf(l) { return l.h_fond; }
  function tfd(l) { return l.h_fond + '|' + l.h_desc; }
  function tfdl(l) { return l.h_fond + '|' + l.h_desc + '|' + l.h_let; }

  function signature(lignes) {
    return lignes[0].ecriture_date + '\n' + multiensemble(lignes, tfdl);
  }

  function sousTypes(base, fichier) {
    var types = [];
    var memeDate = base[0].ecriture_date === fichier[0].ecriture_date;
    if (memeDate && multiensemble(base, tfdl) === multiensemble(fichier, tfdl)) return types;
    var fondDiffere = multiensemble(base, tf) !== multiensemble(fichier, tf);
    if (fondDiffere) types.push(T.M_FOND);
    if (!memeDate) types.push(T.M_DATE);
    if (!fondDiffere) {
      if (multiensemble(base, tfd) !== multiensemble(fichier, tfd)) types.push(T.M_DESC);
      else if (multiensemble(base, tfdl) !== multiensemble(fichier, tfdl)) types.push(T.M_LET);
    }
    return types;
  }

  function distinctes(valeurs) {
    var vues = {};
    return valeurs.filter(function (v) { if (vues[v]) return false; vues[v] = true; return true; });
  }

  return {
    classer: classer,
    dansPerimetre: dansPerimetre
  };
})(
  typeof Modele !== 'undefined' ? Modele : require('./modele'),
  typeof Identite !== 'undefined' ? Identite : require('./identite')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Comparaison;
