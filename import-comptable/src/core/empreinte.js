/**
 * Sérialisation et empreintes : implémentation unique (contrat §5).
 *
 *   H(nom, valeurs)   = "v1:" + sha256Hex("v1:" + nom + US + valeurs.join(US))
 *   Coll(nom, items)  = H(nom, [String(items.length)].concat(items))
 *
 * Valeurs : chaîne telle quelle (sans U+001F), entier en base 10, null/absent = "", booléen = "1"/"0".
 */
var Empreinte = (function (C) {
  'use strict';

  var US = '\u001F';
  var PREFIXE = C.VERSION_EMPREINTE + ':';

  /** Vecteurs de référence calculés hors Node (sha256sum, Python hashlib). */
  var VECTEURS = [
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['\u00C9criture comptable \u2014 1\u00A0234,56 \u20AC', '3d0da68192f3891c09080d9c075bcc71cbd6324e22c203c136355afeb7f34c06']
  ];

  /** Vérifie un Hasher (port injecté) : SHA-256 UTF-8, 64 caractères hexadécimaux minuscules. */
  function verifierHasher(hasher) {
    if (!hasher || typeof hasher.sha256Hex !== 'function') throw C.erreurContrat('HASHER_INVALIDE', 'sha256Hex');
    for (var i = 0; i < VECTEURS.length; i++) {
      var r = hasher.sha256Hex(VECTEURS[i][0]);
      if (typeof r !== 'string' || !/^[0-9a-f]{64}$/.test(r) || r !== VECTEURS[i][1]) {
        throw C.erreurContrat('HASHER_INVALIDE', 'vecteur_' + (i + 1));
      }
    }
    return true;
  }

  function valeur(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'number') {
      if (!(Math.floor(v) === v && Math.abs(v) <= 9007199254740991)) throw C.erreurContrat('SERIALISATION_INVALIDE', 'nombre');
      return String(v);
    }
    if (typeof v !== 'string') throw C.erreurContrat('SERIALISATION_INVALIDE', 'type');
    if (v.indexOf(US) !== -1) throw C.erreurContrat('SERIALISATION_INVALIDE', 'separateur');
    return v;
  }

  function serialiser(nom, valeurs) {
    return PREFIXE + nom + US + valeurs.map(valeur).join(US);
  }

  function H(nom, valeurs, hasher) {
    return PREFIXE + hasher.sha256Hex(serialiser(nom, valeurs));
  }

  /** Collection : `items` dans l'ordre fourni ; `trier` = true pour l'ordre des unités de code UTF-16. */
  function Coll(nom, items, hasher, trier) {
    var liste = trier ? items.slice().sort(comparerTexte) : items;
    return H(nom, [String(liste.length)].concat(liste), hasher);
  }

  function comparerTexte(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  return {
    US: US,
    VECTEURS: VECTEURS,
    verifierHasher: verifierHasher,
    serialiser: serialiser,
    H: H,
    Coll: Coll,
    comparerTexte: comparerTexte
  };
})(typeof Constantes !== 'undefined' ? Constantes : require('./constantes'));

if (typeof module !== 'undefined' && module.exports) module.exports = Empreinte;
