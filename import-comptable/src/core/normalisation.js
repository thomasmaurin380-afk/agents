/**
 * Règles de normalisation `norm_v2` : fonctions pures et déterministes.
 * Les montants sont lus depuis la chaîne et convertis en centimes entiers, sans aucun calcul flottant.
 */
var Normalisation = (function (C) {
  'use strict';

  // Motifs typiques d'un texte UTF-8 relu comme windows-1252 / ISO-8859-1 : « Ã© », « Ã¨ », « Ã‰ », « Â° »…
  var MOTIF_DOUBLE_ENCODAGE = /\u00C3[\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]|\u00C2[\u0080-\u00BF]|\u00E2\u20AC/;

  /**
   * @returns {string[]} motifs : CARACTERE_REMPLACEMENT (U+FFFD), DOUBLE_ENCODAGE
   */
  function verifierEncodage(texte) {
    var motifs = [];
    if (texte.indexOf('\uFFFD') !== -1) motifs.push('CARACTERE_REMPLACEMENT');
    if (MOTIF_DOUBLE_ENCODAGE.test(texte)) motifs.push('DOUBLE_ENCODAGE');
    return motifs;
  }

  /**
   * Texte : NFC ; caractères de contrôle C0/C1 et espaces spéciales ramenés à une espace ;
   * espaces multiples réduites ; trim. Casse conservée. Garantit l'absence de U+001F.
   */
  function normTexte(valeur) {
    if (valeur === undefined || valeur === null) return '';
    var s = String(valeur);
    if (typeof s.normalize === 'function') s = s.normalize('NFC');
    s = s.replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u2007\u202F]/g, ' ');
    s = s.replace(/ {2,}/g, ' ');
    return s.trim();
  }

  function normCode(valeur) { return normTexte(valeur).toUpperCase(); }

  /** Vrai si la valeur serait interprétée comme une formule par un tableur. */
  function doitEtreNeutralise(valeur) {
    return typeof valeur === 'string' && /^[=+\-@]/.test(valeur);
  }

  /**
   * Neutralisation à appliquer par l'adaptateur Sheets au moment de l'écriture (mécanisme exact : spike SP1).
   * La valeur canonique (empreintes, comparaisons) reste le texte d'origine.
   */
  function neutraliser(valeur) {
    var n = doitEtreNeutralise(valeur);
    return { valeur: n ? "'" + valeur : valeur, neutralise: n };
  }

  /**
   * @param {string} valeur ex. « 1 234,56 », « (12,00) », « 12,00- », « 1,230 » (P7)
   * @param {string} decimal ',' ou '.'
   * @returns {{ok: true, cts: number, vide: boolean, negatif: boolean, decimalesNulles: boolean} |
   *           {ok: false, motif: 'MONTANT'|'PRECISION'}}
   *   P7 : au-delà de 2 décimales, les chiffres supplémentaires doivent tous être nuls ; sinon PRECISION.
   *   Jamais d'arrondi.
   */
  function parseMontant(valeur, decimal) {
    if (decimal !== ',' && decimal !== '.') throw C.erreurContrat('PROFIL_INVALIDE', 'decimal');
    var milliers = decimal === ',' ? '.' : ',';
    var s = (valeur === undefined || valeur === null) ? '' : String(valeur);
    s = s.replace(/[\s\u00A0\u202F]/g, '');
    if (s === '') return { ok: true, cts: 0, vide: true, negatif: false, decimalesNulles: false };

    var negatif = false;
    var marqueurs = 0;
    var m = /^\((.*)\)$/.exec(s);
    if (m) { negatif = true; marqueurs++; s = m[1]; }
    if (/^-/.test(s)) { negatif = true; marqueurs++; s = s.slice(1); }
    else if (/^\+/.test(s)) { s = s.slice(1); }
    if (/-$/.test(s)) { negatif = true; marqueurs++; s = s.slice(0, -1); }
    if (marqueurs > 1) return { ok: false, motif: 'MONTANT' };

    var parties = s.split(decimal);
    if (parties.length > 2) return { ok: false, motif: 'MONTANT' };
    var entier = parties[0];
    var fraction = parties.length === 2 ? parties[1] : null;

    if (entier.indexOf(milliers) !== -1) {
      if (!new RegExp('^\\d{1,3}(\\' + milliers + '\\d{3})+$').test(entier)) return { ok: false, motif: 'MONTANT' };
      entier = entier.split(milliers).join('');
    }
    if (fraction !== null && fraction === '') return { ok: false, motif: 'MONTANT' };
    if (entier === '' && fraction === null) return { ok: false, motif: 'MONTANT' };
    if (entier === '') entier = '0';
    if (!/^\d+$/.test(entier) || (fraction !== null && !/^\d+$/.test(fraction))) return { ok: false, motif: 'MONTANT' };
    var decimalesNulles = false;
    if (fraction !== null && fraction.length > 2) {
      if (!/^0+$/.test(fraction.slice(2))) return { ok: false, motif: 'PRECISION' };
      decimalesNulles = true;
      fraction = fraction.slice(0, 2);
    }
    if (entier.replace(/^0+/, '').length > 13) return { ok: false, motif: 'MONTANT' }; // reste un entier sûr en centimes

    var cts = parseInt(entier, 10) * 100 + parseInt(((fraction || '') + '00').slice(0, 2), 10);
    if (negatif && cts !== 0) cts = -cts;
    return { ok: true, cts: cts, vide: false, negatif: cts < 0, decimalesNulles: decimalesNulles };
  }

  /**
   * @param {string} format 'AAAAMMJJ' | 'JJ/MM/AAAA' | 'AAAA-MM-JJ' (aucune devinette)
   * @returns {{ok: true, iso: string, vide: boolean} | {ok: false, motif: 'DATE'}}
   */
  function parseDate(valeur, format) {
    var s = normTexte(valeur);
    if (s === '') return { ok: true, iso: '', vide: true };
    var m, a, mo, j;
    if (format === 'AAAAMMJJ') {
      m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
      if (m) { a = m[1]; mo = m[2]; j = m[3]; }
    } else if (format === 'JJ/MM/AAAA') {
      m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (m) { j = m[1]; mo = m[2]; a = m[3]; }
    } else if (format === 'AAAA-MM-JJ') {
      m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (m) { a = m[1]; mo = m[2]; j = m[3]; }
    } else {
      throw C.erreurContrat('PROFIL_INVALIDE', 'format_date');
    }
    if (!m || !dateExiste(+a, +mo, +j)) return { ok: false, motif: 'DATE' };
    return { ok: true, iso: a + '-' + mo + '-' + j, vide: false };
  }

  function dateExiste(a, mo, j) {
    if (a < 1900 || a > 2100 || mo < 1 || mo > 12 || j < 1) return false;
    var jours = [31, (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return j <= jours[mo - 1];
  }

  /**
   * Compte général : `source` = normTexte ; `compact` = sans espaces, points ni tirets ;
   * complément à droite par des 0 jusqu'à L. Jamais de troncature.
   * @returns {{ok: true, compte: string, source: string, compact: string, vide: boolean} | {ok: false, motif: string}}
   */
  function normCompte(valeur, longueur) {
    if (!(longueur > 0)) throw C.erreurContrat('CLIENT_INVALIDE', 'longueur_compte');
    var source = normTexte(valeur);
    var compact = source.replace(/[ .\-]/g, '').toUpperCase();
    if (compact === '') return { ok: true, compte: '', source: source, compact: compact, vide: true };
    if (!/^\d+$/.test(compact)) return { ok: false, motif: 'COMPTE_NON_NUM' };
    if (compact.length > longueur) return { ok: false, motif: 'COMPTE_LONG' };
    var compte = compact;
    while (compte.length < longueur) compte += '0';
    return { ok: true, compte: compte, source: source, compact: compact, vide: false };
  }

  /** Compte auxiliaire : alphanumérique, majuscules, zéros de tête conservés, sans complément. */
  function normAuxiliaire(valeur) {
    return normTexte(valeur).replace(/ /g, '').toUpperCase();
  }

  return {
    verifierEncodage: verifierEncodage,
    normTexte: normTexte,
    normCode: normCode,
    doitEtreNeutralise: doitEtreNeutralise,
    neutraliser: neutraliser,
    parseMontant: parseMontant,
    parseDate: parseDate,
    normCompte: normCompte,
    normAuxiliaire: normAuxiliaire
  };
})(typeof Constantes !== 'undefined' ? Constantes : require('./constantes'));

if (typeof module !== 'undefined' && module.exports) module.exports = Normalisation;
