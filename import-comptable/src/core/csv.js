/**
 * Lecture CSV (RFC 4180) à partir d'une chaîne déjà décodée.
 *
 * Compatible Node et Apps Script V8 : aucun appel d'API externe.
 * Le décodage des octets (UTF-8, windows-1252) relève de l'adaptateur.
 */
var Csv = (function () {
  'use strict';

  var BOM = '\uFEFF';

  /**
   * @param {string} texte Contenu décodé du fichier.
   * @param {{separateur: string}} options
   * @returns {{
   *   bom: boolean,
   *   entete: string[],
   *   enregistrements: {rang: number, ligneFin: number, champs: string[], vide: boolean}[],
   *   erreurs: {rang: number, code: string}[],
   *   lignesPhysiques: number
   * }}
   *   `rang` = numéro de la ligne physique où commence l'enregistrement (l'en-tête est la ligne 1).
   */
  function parseCsv(texte, options) {
    if (typeof texte !== 'string') throw new TypeError('parseCsv: texte attendu');
    var sep = options && options.separateur;
    if (typeof sep !== 'string' || sep.length !== 1 || sep === '"' || sep === '\n' || sep === '\r') {
      throw new Error('parseCsv: séparateur invalide');
    }

    var bom = texte.charAt(0) === BOM;
    if (bom) texte = texte.slice(1);

    var enregistrements = [];
    var erreurs = [];
    var champs = [];
    var champ = '';
    var dansGuillemets = false;
    var champCite = false; // le champ courant a commencé par un guillemet
    var ligne = 1;
    var debutEnregistrement = 1;
    var i = 0;
    var n = texte.length;

    function finChamp() {
      champs.push(champ);
      champ = '';
      champCite = false;
    }
    function finEnregistrement() {
      finChamp();
      enregistrements.push({ rang: debutEnregistrement, ligneFin: ligne, champs: champs });
      champs = [];
    }

    while (i < n) {
      var c = texte.charAt(i);
      if (dansGuillemets) {
        if (c === '"') {
          if (texte.charAt(i + 1) === '"') {
            champ += '"';
            i += 2;
            continue;
          }
          dansGuillemets = false;
          i++;
          continue;
        }
        if (c === '\r' && texte.charAt(i + 1) === '\n') {
          champ += '\n';
          ligne++;
          i += 2;
          continue;
        }
        if (c === '\n' || c === '\r') ligne++;
        champ += c;
        i++;
        continue;
      }
      if (c === '"' && champ === '' && !champCite) {
        dansGuillemets = true;
        champCite = true;
        i++;
        continue;
      }
      if (c === sep) {
        finChamp();
        i++;
        continue;
      }
      if (c === '\r' || c === '\n') {
        finEnregistrement();
        i += (c === '\r' && texte.charAt(i + 1) === '\n') ? 2 : 1;
        ligne++;
        debutEnregistrement = ligne;
        continue;
      }
      champ += c;
      i++;
    }
    if (dansGuillemets) erreurs.push({ rang: debutEnregistrement, code: 'GUILLEMET_NON_FERME' });
    // Un dernier enregistrement sans fin de ligne finale.
    if (champ !== '' || champs.length > 0 || dansGuillemets) finEnregistrement();

    var lignesPhysiques = compterLignesPhysiques(texte);
    var entete = enregistrements.length ? enregistrements.shift().champs : [];
    for (var k = 0; k < enregistrements.length; k++) {
      enregistrements[k].vide = estVide(enregistrements[k].champs);
    }
    return {
      bom: bom,
      entete: entete,
      enregistrements: enregistrements,
      erreurs: erreurs,
      lignesPhysiques: lignesPhysiques
    };
  }

  function estVide(champs) {
    for (var i = 0; i < champs.length; i++) {
      if (champs[i].replace(/[\s\u00A0\u202F]/g, '') !== '') return false;
    }
    return true;
  }

  /**
   * Compte indépendant du nombre de lignes physiques (hors dernière fin de ligne),
   * utilisé par le contrôle REC_LIGNES pour vérifier que le parseur n'a rien perdu.
   */
  function compterLignesPhysiques(texte) {
    if (texte === '') return 0;
    var morceaux = texte.split(/\r\n|\r|\n/);
    if (morceaux[morceaux.length - 1] === '') morceaux.pop();
    return morceaux.length;
  }

  return {
    parseCsv: parseCsv,
    compterLignesPhysiques: compterLignesPhysiques
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Csv;
