/**
 * Identité des écritures (clé K2) et empreintes de contenu.
 *
 * La clé dit « qui est-ce » ; les empreintes disent « ce que ça contient ».
 * Sérialisation : champs dans un ordre fixe, séparés par U+001F, préfixe de version.
 */
var Identite = (function (Modele) {
  'use strict';

  var SEP = '\u001F';
  var CHAMPS_FOND = ['compte_num', 'comp_aux_num', 'debit_cts', 'credit_cts', 'idevise', 'montant_devise_cts'];
  var CHAMPS_DESC = ['ecriture_lib', 'piece_ref', 'piece_date', 'journal_lib', 'compte_lib', 'comp_aux_lib', 'valid_date'];
  var CHAMPS_LET = ['ecriture_let', 'date_let'];

  /**
   * Clé K2 : client | exercice | journal | numéro (+ | AAAA-MM en portée JOURNAL_MOIS).
   */
  function cleEcriture(ligne, profil) {
    var parties = [ligne.client_id, ligne.exercice_id, ligne.journal_code, ligne.ecriture_num];
    if (profil && profil.portee_numerotation === 'JOURNAL_MOIS') parties.push(ligne.ecriture_date.slice(0, 7));
    return parties.join('|');
  }

  function serialiser(ligne, champs) {
    return champs.map(function (c) {
      var v = ligne[c];
      return v === undefined || v === null ? '' : String(v);
    }).join(SEP);
  }

  function hacher(prefixe, contenu, hasher) {
    return Modele.VERSION_EMPREINTE + ':' + hasher.sha256Hex(prefixe + SEP + contenu);
  }

  /**
   * @returns {{h_fond: string, h_desc: string, h_let: string}}
   */
  function empreintes(ligne, hasher) {
    return {
      h_fond: hacher('FOND', serialiser(ligne, CHAMPS_FOND), hasher),
      h_desc: hacher('DESC', serialiser(ligne, CHAMPS_DESC), hasher),
      h_let: hacher('LET', serialiser(ligne, CHAMPS_LET), hasher)
    };
  }

  /** Empreinte d'une ligne complète (champs métier), utilisée par le checksum et le staging. */
  function empreinteLigne(ligne, hasher) {
    return hacher('LIGNE', serialiser(ligne, Modele.CHAMPS_LIGNE), hasher);
  }

  return {
    SEP: SEP,
    CHAMPS_FOND: CHAMPS_FOND,
    CHAMPS_DESC: CHAMPS_DESC,
    CHAMPS_LET: CHAMPS_LET,
    cleEcriture: cleEcriture,
    serialiser: serialiser,
    empreintes: empreintes,
    empreinteLigne: empreinteLigne
  };
})(typeof Modele !== 'undefined' ? Modele : require('./modele'));

if (typeof module !== 'undefined' && module.exports) module.exports = Identite;
