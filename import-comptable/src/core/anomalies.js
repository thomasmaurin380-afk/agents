/**
 * Anomalies : création, empreintes d'objet et de dérogation (A5, P1), application des décisions,
 * reconduction des dérogations.
 */
var Anomalies = (function (C, E) {
  'use strict';

  /**
   * @param {string} code
   * @param {{gravite?: string, objet_type?: string, objet_cle?: string, attendu?: *, obtenu?: *, ecart?: *,
   *          nb?: number, rangs?: number[], cles?: string[], mention?: string, message?: string}} [champs]
   */
  function creer(code, champs) {
    champs = champs || {};
    var def = C.CODES[code];
    if (!def) throw C.erreurContrat('ARGUMENT_MANQUANT', 'code');
    var objetType = champs.objet_type || 'FICHIER';
    var objetCle = champs.objet_cle || '';
    return {
      anomalie_id: code + '|' + objetType + '|' + objetCle,
      code: code,
      gravite: champs.gravite || def.gravite,
      objet_type: objetType,
      objet_cle: objetCle,
      attendu: texte(champs.attendu),
      obtenu: texte(champs.obtenu),
      ecart: texte(champs.ecart),
      nb: champs.nb || 0,
      rangs: (champs.rangs || []).slice().sort(function (a, b) { return a - b; }),
      cles: (champs.cles || []).slice().sort(E.comparerTexte),
      mention: champs.mention || '',
      message: champs.message || '',
      reconductible: def.reconductible !== false,
      empreinte_objet: '',
      empreinte_derogation: '',
      statut: 'OUVERTE',
      control_version: C.VERSION_REGLES
    };
  }

  function texte(v) { return v === undefined || v === null ? '' : String(v); }

  /** empreinte_objet = H("objet", [code, objet_type, objet_cle, attendu, obtenu, ecart, Coll("concernees", h)]) */
  function empreinteObjet(anomalie, hConcernees, hasher) {
    return E.H('objet', [anomalie.code, anomalie.objet_type, anomalie.objet_cle, anomalie.attendu, anomalie.obtenu,
      anomalie.ecart, E.Coll('concernees', hConcernees || [], hasher, true)], hasher);
  }

  /**
   * Empreinte de dérogation (A5).
   * P1 : périmètre limité à l'exercice pour une anomalie portant sur une écriture ou un compte (le contenu
   * de l'objet est figé par empreinte_objet) ; exercice + du + au pour une anomalie de niveau fichier,
   * exercice ou actif.
   */
  function empreinteDerogation(anomalie, ctx, hasher) {
    var p = ctx.perimetre;
    var objetPrecis = anomalie.objet_type === 'ECRITURE' || anomalie.objet_type === 'COMPTE';
    var perimetre = objetPrecis ? p.exercice_id : [p.exercice_id, p.du, p.au].join('|');
    return E.H('derogation', [anomalie.code, anomalie.gravite, anomalie.objet_type, anomalie.objet_cle,
      anomalie.empreinte_objet, perimetre, ctx.statut_exercice, ctx.profil_id, ctx.profil_version, C.VERSION_REGLES], hasher);
  }

  function copier(a) {
    var c = {};
    Object.keys(a).forEach(function (k) { c[k] = Array.isArray(a[k]) ? a[k].slice() : a[k]; });
    return c;
  }

  /**
   * Applique les décisions humaines aux anomalies (copies) et signale les décisions invalides.
   * - DEROGATION : anomalie existante de gravité B, empreinte de dérogation égale, motif ≥ 20 caractères, auteur.
   * - ACQUITTEMENT : chaque anomalie listée existe, est de gravité A et du code indiqué.
   * - ABSENTE : vaut acquittement de l'IDN_ABSENTE (A). Sur exercice clôturé (IDN_ABSENTE de gravité B, P5),
   *   la décision elle-même est la validation renforcée : motif ≥ 20 caractères exigé, aucune dérogation séparée.
   * @returns {{anomalies: object[], erreurs: {code: string, decision_id: string}[]}}
   */
  function appliquerDecisions(anomalies, decisions) {
    var parId = {};
    var copies = anomalies.map(function (a) { var c = copier(a); parId[c.anomalie_id] = c; return c; });
    var erreurs = [];
    function motifValide(d) { return String(d.motif || '').trim().length >= C.MOTIF_MIN && !!d.par; }

    (decisions || []).forEach(function (d) {
      if (d.type === 'DEROGATION') {
        var a = parId[d.anomalie_id];
        if (!a || a.gravite !== 'B' || a.empreinte_derogation !== d.empreinte_derogation || !motifValide(d)) {
          erreurs.push({ code: 'PUB_DEROGATION_INVALIDE', decision_id: d.decision_id });
        } else {
          a.statut = 'DEROGEE';
        }
      } else if (d.type === 'ACQUITTEMENT') {
        var ok = Array.isArray(d.anomalie_ids) && d.anomalie_ids.length > 0 && !!d.par && d.anomalie_ids.every(function (id) {
          var x = parId[id];
          return x && x.gravite === 'A' && x.code === d.code;
        });
        if (!ok) erreurs.push({ code: 'PUB_ACQUITTEMENT_INVALIDE', decision_id: d.decision_id });
        else d.anomalie_ids.forEach(function (id) { parId[id].statut = 'ACQUITTEE'; });
      } else if (d.type === 'ABSENTE') {
        var abs = parId['IDN_ABSENTE|ECRITURE|' + d.cle];
        if (!abs) return; // décision sans objet : refus PUB_ABSENTE_SANS_DECISION ou ignorée par la publication
        if (abs.gravite === 'B') {
          if (motifValide(d)) abs.statut = 'DEROGEE';
          else erreurs.push({ code: 'PUB_ABSENTE_CLOTURE_NON_MOTIVEE', decision_id: d.decision_id });
        } else if (String(d.motif || '').trim() && d.par) {
          abs.statut = 'ACQUITTEE';
        }
      } else {
        throw C.erreurContrat('ARGUMENT_MANQUANT', 'decision.type');
      }
    });
    return { anomalies: copies, erreurs: erreurs };
  }

  /**
   * Reconduit les dérogations de la dernière publication appliquée dont l'empreinte est strictement égale à celle
   * d'une anomalie B de l'import courant. Jamais pour BND, A, I, ni pour les codes non reconductibles (P2).
   * @returns {object[]} DecisionDerogation (origine RECONDUCTION)
   */
  function reconduireDerogations(e) {
    var parEmpreinte = {};
    (e.derogations_precedentes || []).forEach(function (d) { parEmpreinte[d.empreinte_derogation] = d; });
    return e.anomalies.filter(function (a) {
      return a.gravite === 'B' && a.reconductible && a.empreinte_derogation && parEmpreinte[a.empreinte_derogation];
    }).map(function (a) {
      var source = parEmpreinte[a.empreinte_derogation];
      return {
        decision_id: 'RECOND:' + e.import_id + ':' + a.anomalie_id,
        type: 'DEROGATION',
        import_id: e.import_id,
        anomalie_id: a.anomalie_id,
        empreinte_derogation: a.empreinte_derogation,
        motif: source.motif,
        reference: source.reference || '',
        par: 'SYSTEME',
        le: e.horodatage || '',
        origine: 'RECONDUCTION',
        source_decision_id: source.decision_id
      };
    });
  }

  return {
    creer: creer,
    empreinteObjet: empreinteObjet,
    empreinteDerogation: empreinteDerogation,
    appliquerDecisions: appliquerDecisions,
    reconduireDerogations: reconduireDerogations
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Anomalies;
