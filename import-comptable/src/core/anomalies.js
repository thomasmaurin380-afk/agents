/**
 * Création des anomalies, empreinte de dérogation et reconduction (arbitrage A5).
 */
var Anomalies = (function (Modele) {
  'use strict';

  var SEP = '\u001F';

  /**
   * @param {string} code
   * @param {{gravite?: string, objet_type?: string, objet_cle?: string, attendu?: *, obtenu?: *,
   *          message?: string, details?: object}} [champs]
   */
  function creer(code, champs) {
    champs = champs || {};
    var gravite = champs.gravite || Modele.GRAVITE_PAR_CODE[code];
    if (!gravite) throw new Error('Code d\'anomalie inconnu : ' + code);
    var objetType = champs.objet_type || 'FICHIER';
    var objetCle = champs.objet_cle || '';
    return {
      anomalie_id: code + '|' + objetType + '|' + objetCle,
      code: code,
      gravite: gravite,
      objet_type: objetType,
      objet_cle: objetCle,
      attendu: champs.attendu === undefined ? '' : String(champs.attendu),
      obtenu: champs.obtenu === undefined ? '' : String(champs.obtenu),
      message: champs.message || '',
      details: champs.details || null,
      empreinte_objet: '',
      empreinte_derogation: ''
    };
  }

  function estBloquante(anomalie) {
    return anomalie.gravite === 'BND' || anomalie.gravite === 'B';
  }

  /**
   * Empreinte de dérogation (A5) : une dérogation n'est reconduite que si l'anomalie, son périmètre
   * et son contexte sont identiques.
   * Périmètre retenu (point ouvert P1 du contrat) : l'exercice seul pour une anomalie portant sur une
   * écriture ou un compte (l'objet lui-même est figé par `empreinte_objet`) ; exercice + du + au sinon.
   * @param {object} anomalie
   * @param {{perimetre: {exercice_id: string, du: string, au: string}, statut_exercice: string,
   *          profil_id: string, profil_version: (number|string), empreinte_objet: string}} contexte
   * @param {{sha256Hex: function(string): string}} hasher
   */
  function empreinteDerogation(anomalie, contexte, hasher) {
    var p = contexte.perimetre;
    var objetPrecis = anomalie.objet_type === 'ECRITURE' || anomalie.objet_type === 'COMPTE';
    var perimetre = objetPrecis ? p.exercice_id : [p.exercice_id, p.du, p.au].join('|');
    return Modele.VERSION_EMPREINTE + ':' + hasher.sha256Hex([
      'DEROGATION', anomalie.code, anomalie.gravite, anomalie.objet_type, anomalie.objet_cle,
      anomalie.attendu, anomalie.obtenu, perimetre, contexte.statut_exercice || '',
      contexte.profil_id, String(contexte.profil_version), Modele.VERSION_REGLES, contexte.empreinte_objet || ''
    ].join(SEP));
  }

  /**
   * Reconduit les dérogations précédentes dont l'empreinte est strictement égale à celle d'une anomalie B
   * de l'import courant. Les acquittements et les anomalies BND, A, I ne sont jamais reconduits.
   * @param {object[]} anomalies anomalies de l'import courant (empreinte_derogation renseignée)
   * @param {{anomalie_id: string, empreinte_derogation: string, motif: string, par: string}[]} precedentes
   *   dérogations retenues lors de la dernière publication appliquée
   * @returns {object[]} dérogations reconduites (origine RECONDUCTION)
   */
  function reconduireDerogations(anomalies, precedentes) {
    var parEmpreinte = {};
    (precedentes || []).forEach(function (d) { parEmpreinte[d.empreinte_derogation] = d; });
    return anomalies.filter(function (a) {
      return a.gravite === 'B' && a.empreinte_derogation && parEmpreinte[a.empreinte_derogation];
    }).map(function (a) {
      var source = parEmpreinte[a.empreinte_derogation];
      return {
        anomalie_id: a.anomalie_id,
        empreinte_derogation: a.empreinte_derogation,
        motif: source.motif,
        par: 'SYSTEME',
        origine: 'RECONDUCTION',
        source_anomalie_id: source.anomalie_id
      };
    });
  }

  return {
    creer: creer,
    estBloquante: estBloquante,
    empreinteDerogation: empreinteDerogation,
    reconduireDerogations: reconduireDerogations
  };
})(typeof Modele !== 'undefined' ? Modele : require('./modele'));

if (typeof module !== 'undefined' && module.exports) module.exports = Anomalies;
