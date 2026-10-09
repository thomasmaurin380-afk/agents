/**
 * Profils d'import : validation et correspondance de l'en-tête source.
 */
var Profil = (function (Modele, Normalisation) {
  'use strict';

  var FORMATS_DATE = ['AAAAMMJJ', 'JJ/MM/AAAA', 'AAAA-MM-JJ'];

  /** Lève une erreur si le profil est structurellement invalide (erreur de paramétrage, pas de données). */
  function validerProfil(profil) {
    var erreurs = [];
    if (!profil || typeof profil !== 'object') throw new Error('Profil absent');
    if (!profil.profil_id) erreurs.push('profil_id manquant');
    if (profil.type !== 'FEC' && profil.type !== 'GL') erreurs.push('type doit valoir FEC ou GL');
    if (typeof profil.separateur !== 'string' || profil.separateur.length !== 1) erreurs.push('separateur invalide');
    if (profil.decimal !== ',' && profil.decimal !== '.') erreurs.push('decimal invalide');
    if (FORMATS_DATE.indexOf(profil.format_date) === -1) erreurs.push('format_date invalide');
    if (profil.mode_sens !== 'DEBIT_CREDIT' && profil.mode_sens !== 'MONTANT_SENS') erreurs.push('mode_sens invalide');
    if (!profil.colonnes || typeof profil.colonnes !== 'object') erreurs.push('colonnes manquantes');
    else {
      Object.keys(profil.colonnes).forEach(function (src) {
        if (Modele.CHAMPS_SOURCE.indexOf(profil.colonnes[src]) === -1) {
          erreurs.push('champ canonique inconnu pour la colonne « ' + src + ' » : ' + profil.colonnes[src]);
        }
      });
    }
    if (profil.mode_sens === 'MONTANT_SENS') {
      var vs = profil.valeurs_sens;
      if (!vs || !Array.isArray(vs.D) || !Array.isArray(vs.C)) erreurs.push('valeurs_sens requis en mode MONTANT_SENS');
    }
    if (profil.portee_numerotation && profil.portee_numerotation !== 'EXERCICE' && profil.portee_numerotation !== 'JOURNAL_MOIS') {
      erreurs.push('portee_numerotation invalide');
    }
    if (erreurs.length) throw new Error('Profil ' + (profil.profil_id || '?') + ' invalide : ' + erreurs.join(' ; '));
    return true;
  }

  function cleEntete(nom) {
    return Normalisation.normTexte(nom).toLowerCase();
  }

  /**
   * Associe chaque champ canonique à l'index de sa colonne.
   * Colonne obligatoire absente, colonne inconnue ou doublon → anomalie STR_ENTETE (BND).
   * @returns {{ok: boolean, index: Object<string, number>, anomalies: {code: string, message: string}[]}}
   */
  function mapperEntete(entete, profil) {
    var parSource = {};
    Object.keys(profil.colonnes).forEach(function (src) { parSource[cleEntete(src)] = profil.colonnes[src]; });
    var ignorees = {};
    (profil.colonnes_ignorees || []).forEach(function (src) { ignorees[cleEntete(src)] = true; });

    var index = {};
    var problemes = [];
    entete.forEach(function (nom, i) {
      var k = cleEntete(nom);
      if (ignorees[k]) return;
      var champ = parSource[k];
      if (!champ) { problemes.push('colonne inconnue « ' + Normalisation.normTexte(nom) + ' »'); return; }
      if (index[champ] !== undefined) { problemes.push('champ « ' + champ + ' » mappé deux fois'); return; }
      index[champ] = i;
    });

    var requis = Modele.CHAMPS_INDISPENSABLES.slice();
    if (profil.type === 'FEC') requis = Modele.CHAMPS_FEC.slice();
    requis = requis.concat(profil.mode_sens === 'MONTANT_SENS' ? ['montant', 'sens'] : ['debit', 'credit']);
    requis.forEach(function (champ) {
      if (index[champ] === undefined) {
        var msg = 'colonne obligatoire absente : ' + champ;
        if (champ === 'ecriture_num') msg += ' — numéro d\'écriture requis (A1) : exporter le FEC';
        problemes.push(msg);
      }
    });

    return {
      ok: problemes.length === 0,
      index: index,
      anomalies: problemes.map(function (m) { return { code: 'STR_ENTETE', message: m }; })
    };
  }

  return {
    validerProfil: validerProfil,
    mapperEntete: mapperEntete
  };
})(
  typeof Modele !== 'undefined' ? Modele : require('./modele'),
  typeof Normalisation !== 'undefined' ? Normalisation : require('./normalisation')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Profil;
