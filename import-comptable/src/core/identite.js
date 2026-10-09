/**
 * Identité des écritures (clé K2), empreintes de ligne et d'écriture, identifiant de ligne.
 * La clé dit « qui est-ce » ; les empreintes disent « ce que ça contient ».
 */
var Identite = (function (C, E) {
  'use strict';

  var CHAMPS_FOND = ['compte_num', 'comp_aux_num', 'debit_cts', 'credit_cts', 'idevise', 'montant_devise_cts'];
  var CHAMPS_DESC = ['ecriture_lib', 'piece_ref', 'piece_date', 'journal_lib', 'compte_lib', 'comp_aux_lib', 'valid_date'];
  var CHAMPS_LET = ['ecriture_let', 'date_let'];

  function valeurs(ligne, champs) { return champs.map(function (c) { return ligne[c]; }); }

  /** Clé K2 : client | exercice | journal | numéro. Seule la portée EXERCICE est admise à cette étape. */
  function cleEcriture(ligne, profil) {
    if (profil && (profil.portee_numerotation || 'EXERCICE') !== 'EXERCICE') throw C.erreurContrat('PROFIL_INVALIDE', 'portee_numerotation');
    return [ligne.client_id, ligne.exercice_id, ligne.journal_code, ligne.ecriture_num].join('|');
  }

  /** @returns {{h_fond: string, h_desc: string, h_let: string}} */
  function empreintes(ligne, hasher) {
    return {
      h_fond: E.H('h_fond', valeurs(ligne, CHAMPS_FOND), hasher),
      h_desc: E.H('h_desc', valeurs(ligne, CHAMPS_DESC), hasher),
      h_let: E.H('h_let', valeurs(ligne, CHAMPS_LET), hasher)
    };
  }

  /** hLigne = H("ligne", valeurs de CHAMPS_ACTIF) — ligne active complète. */
  function hLigne(ligne, hasher) {
    return E.H('ligne', valeurs(ligne, C.CHAMPS_ACTIF), hasher);
  }

  /** h_ecr = H("ecriture", [cle, date, liste triée des h_fond+h_desc+h_let]) — lignes munies de leurs empreintes. */
  function hEcriture(lignes, hasher) {
    if (!lignes.length) return '';
    var items = lignes.map(function (l) { return l.h_fond + l.h_desc + l.h_let; }).sort(E.comparerTexte);
    return E.H('ecriture', [lignes[0].cle_ecriture, lignes[0].ecriture_date].concat(items), hasher);
  }

  /** Ordre canonique des lignes d'une écriture : compte, auxiliaire, montant signé, rang source. */
  function comparerLignes(a, b) {
    if (a.compte_num !== b.compte_num) return a.compte_num < b.compte_num ? -1 : 1;
    if (a.comp_aux_num !== b.comp_aux_num) return a.comp_aux_num < b.comp_aux_num ? -1 : 1;
    if (a.montant_cts !== b.montant_cts) return a.montant_cts - b.montant_cts;
    return a.source_rang - b.source_rang;
  }

  /** ligne_uid = cle_ecriture + "#" + k (k = 1..n dans l'ordre canonique). Renvoie des copies. */
  function attribuerLigneUid(lignes) {
    return lignes.slice().sort(comparerLignes).map(function (l, i) {
      var c = {};
      Object.keys(l).forEach(function (k) { c[k] = l[k]; });
      c.ligne_uid = l.cle_ecriture + '#' + (i + 1);
      return c;
    });
  }

  return {
    CHAMPS_FOND: CHAMPS_FOND,
    CHAMPS_DESC: CHAMPS_DESC,
    CHAMPS_LET: CHAMPS_LET,
    cleEcriture: cleEcriture,
    empreintes: empreintes,
    hLigne: hLigne,
    hEcriture: hEcriture,
    attribuerLigneUid: attribuerLigneUid
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Identite;
