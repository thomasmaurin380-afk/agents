/**
 * Règles de normalisation `norm_v1` : fonctions pures, déterministes.
 * Aucun calcul en virgule flottante : les montants sont parsés depuis la chaîne
 * et convertis en centimes entiers.
 */
var Normalisation = (function () {
  'use strict';

  var VERSION = 'norm_v1';

  // Motifs typiques d'un texte UTF-8 relu comme windows-1252 / ISO-8859-1 :
  // « Ã© », « Ã¨ », « Ã‰ », « Â° »…
  var MOTIF_DOUBLE_ENCODAGE = /Ã[\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]|Â[\u0080-¿]/;

  /**
   * Détecte les signes d'un mauvais décodage.
   * @param {string} texte
   * @returns {string[]} codes : CARACTERE_REMPLACEMENT, DOUBLE_ENCODAGE
   */
  function verifierEncodage(texte) {
    var codes = [];
    if (texte.indexOf('�') !== -1) codes.push('CARACTERE_REMPLACEMENT');
    if (MOTIF_DOUBLE_ENCODAGE.test(texte)) codes.push('DOUBLE_ENCODAGE');
    return codes;
  }

  /**
   * Texte : NFC, caractères de contrôle et espaces insécables ramenés à un espace,
   * espaces multiples réduits, trim. La casse est conservée.
   */
  function normTexte(valeur) {
    if (valeur === undefined || valeur === null) return '';
    var s = String(valeur);
    if (typeof s.normalize === 'function') s = s.normalize('NFC');
    s = s.replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u2007\u202F]/g, ' ');
    s = s.replace(/ {2,}/g, ' ');
    return s.trim();
  }

  /** Code (journal, devise) : texte normalisé en majuscules. */
  function normCode(valeur) {
    return normTexte(valeur).toUpperCase();
  }

  /** Vrai si la valeur serait interprétée comme une formule par un tableur. */
  function doitEtreNeutralise(valeur) {
    return typeof valeur === 'string' && /^[=+\-@]/.test(valeur);
  }

  /**
   * Neutralisation à appliquer au moment de l'écriture dans un tableur.
   * La valeur canonique (empreintes, comparaisons) reste le texte d'origine ;
   * le mécanisme exact côté Sheets est à confirmer par le spike SP1.
   */
  function neutraliser(valeur) {
    return doitEtreNeutralise(valeur) ? "'" + valeur : valeur;
  }

  /**
   * @param {string} valeur ex. « 1 234,56 », « (12,00) », « 12,00- », « -0,00 »
   * @param {string} decimal ',' ou '.'
   * @returns {{ok: true, cts: number, vide: boolean, negatif: boolean} | {ok: false, code: string}}
   */
  function parseMontant(valeur, decimal) {
    if (decimal !== ',' && decimal !== '.') throw new Error('parseMontant: séparateur décimal invalide');
    var milliers = decimal === ',' ? '.' : ',';
    var s = (valeur === undefined || valeur === null) ? '' : String(valeur);
    s = s.replace(/[\s\u00A0\u202F]/g, '');
    if (s === '') return { ok: true, cts: 0, vide: true, negatif: false };

    var negatif = false;
    var m = /^\((.*)\)$/.exec(s);
    if (m) { negatif = true; s = m[1]; }
    if (/^-/.test(s)) { negatif = !negatif; s = s.slice(1); }
    else if (/^\+/.test(s)) { s = s.slice(1); }
    if (/-$/.test(s)) { negatif = !negatif; s = s.slice(0, -1); }

    var parties = s.split(decimal);
    if (parties.length > 2) return { ok: false, code: 'MNT_FORMAT' };
    var entier = parties[0];
    var fraction = parties.length === 2 ? parties[1] : '';

    if (entier.indexOf(milliers) !== -1) {
      if (!new RegExp('^\\d{1,3}(\\' + milliers + '\\d{3})+$').test(entier)) return { ok: false, code: 'MNT_FORMAT' };
      entier = entier.split(milliers).join('');
    }
    if (entier === '' && fraction === '') return { ok: false, code: 'MNT_FORMAT' };
    if (entier === '') entier = '0';
    if (!/^\d+$/.test(entier) || !/^\d*$/.test(fraction)) return { ok: false, code: 'MNT_FORMAT' };
    if (fraction.length > 2) return { ok: false, code: 'MNT_PRECISION' };
    if (entier.length > 13) return { ok: false, code: 'MNT_FORMAT' }; // reste sous 2^53 en centimes

    var cts = parseInt(entier, 10) * 100 + parseInt((fraction + '00').slice(0, 2), 10);
    if (negatif && cts !== 0) cts = -cts;
    return { ok: true, cts: cts, vide: false, negatif: negatif && cts !== 0 };
  }

  /**
   * @param {string} valeur
   * @param {string} format 'AAAAMMJJ' | 'JJ/MM/AAAA' | 'AAAA-MM-JJ'
   * @returns {{ok: true, iso: string, vide: boolean} | {ok: false, code: string}}
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
      throw new Error('parseDate: format non supporté ' + format);
    }
    if (!m) return { ok: false, code: 'DATE_FORMAT' };
    if (!dateExiste(+a, +mo, +j)) return { ok: false, code: 'DATE_INEXISTANTE' };
    return { ok: true, iso: a + '-' + mo + '-' + j, vide: false };
  }

  function dateExiste(a, mo, j) {
    if (mo < 1 || mo > 12 || j < 1) return false;
    var jours = [31, (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return j <= jours[mo - 1];
  }

  /**
   * Compte général : retrait des espaces, points et tirets, padding à droite par des 0
   * jusqu'à la longueur L. Jamais de troncature.
   * @returns {{ok: true, compte: string, vide: boolean} | {ok: false, code: string}}
   */
  function normCompte(valeur, longueur) {
    if (!(longueur > 0)) throw new Error('normCompte: longueur invalide');
    var s = normTexte(valeur).replace(/[\s.\-]/g, '').toUpperCase();
    if (s === '') return { ok: true, compte: '', vide: true };
    if (!/^\d+$/.test(s)) return { ok: false, code: 'CPT_NON_NUMERIQUE' };
    if (s.length > longueur) return { ok: false, code: 'CPT_LONGUEUR' };
    while (s.length < longueur) s += '0';
    return { ok: true, compte: s, vide: false };
  }

  /** Compte auxiliaire : alphanumérique, majuscules, zéros de tête conservés, sans padding. */
  function normAuxiliaire(valeur) {
    return normTexte(valeur).replace(/ /g, '').toUpperCase();
  }

  return {
    VERSION: VERSION,
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
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Normalisation;
