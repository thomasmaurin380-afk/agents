/**
 * Validation des paramètres (profil, client, périmètre) et correspondance de l'en-tête source.
 */
var Profil = (function (C, Normalisation) {
  'use strict';

  var FORMATS_DATE = ['AAAAMMJJ', 'JJ/MM/AAAA', 'AAAA-MM-JJ'];
  var SEPARATEURS = ['\t', '|', ';'];
  var ENCODAGES = ['UTF-8', 'windows-1252'];

  /**
   * @returns {{ok: boolean, erreurs: {code: string, champ: string}[]}}
   */
  function validerProfil(p) {
    var erreurs = [];
    function err(champ) { erreurs.push({ code: 'PROFIL_INVALIDE', champ: champ }); }
    if (!p || typeof p !== 'object') return { ok: false, erreurs: [{ code: 'PROFIL_INVALIDE', champ: 'profil' }] };
    if (!p.profil_id) err('profil_id');
    if (!(p.version >= 1 && Math.floor(p.version) === p.version)) err('version');
    if (p.type !== 'FEC' && p.type !== 'GL') err('type');
    if (ENCODAGES.indexOf(p.encodage) === -1) err('encodage');
    if (SEPARATEURS.indexOf(p.separateur) === -1) err('separateur');
    if ((p.decimal !== ',' && p.decimal !== '.') || p.decimal === p.separateur) err('decimal');
    if (FORMATS_DATE.indexOf(p.format_date) === -1) err('format_date');
    if (p.mode_sens !== 'DEBIT_CREDIT' && p.mode_sens !== 'MONTANT_SENS') err('mode_sens');
    if ((p.portee_numerotation || 'EXERCICE') !== 'EXERCICE') err('portee_numerotation');
    if (typeof p.contiguite_ecritures !== 'boolean') err('contiguite_ecritures');
    if (!p.colonnes || typeof p.colonnes !== 'object') {
      err('colonnes');
    } else {
      var vus = {};
      Object.keys(p.colonnes).forEach(function (src) {
        var champ = p.colonnes[src];
        if (C.CHAMPS_SOURCE.indexOf(champ) === -1 || vus[champ]) err('colonnes.' + champ);
        vus[champ] = true;
      });
      var requis = (p.type === 'FEC' ? C.CHAMPS_FEC : C.CHAMPS_INDISPENSABLES)
        .concat(p.mode_sens === 'MONTANT_SENS' ? ['montant', 'sens'] : ['debit', 'credit']);
      if (p.type === 'FEC' && requis.indexOf('piece_ref') === -1) requis.push('piece_ref');
      // A1 : un profil sans numéro d'écriture est invalide (le contrôle de l'en-tête donne le message « exporter le FEC »).
      requis.forEach(function (champ) { if (!vus[champ]) err('colonnes.' + champ); });
      (p.colonnes_ignorees || []).forEach(function (src) { if (p.colonnes[src]) err('colonnes_ignorees'); });
    }
    if (p.mode_sens === 'MONTANT_SENS') {
      var vs = p.valeurs_sens;
      if (!vs || !Array.isArray(vs.D) || !Array.isArray(vs.C) || !vs.D.length || !vs.C.length
          || vs.D.some(function (v) { return vs.C.indexOf(v) !== -1; })) err('valeurs_sens');
    }
    return { ok: erreurs.length === 0, erreurs: erreurs };
  }

  function validerClient(c) {
    if (!c || typeof c !== 'object') throw C.erreurContrat('CLIENT_INVALIDE', 'client');
    if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(c.client_id || '')) throw C.erreurContrat('CLIENT_INVALIDE', 'client_id');
    if (!/^\d{9}$/.test(c.siren || '')) throw C.erreurContrat('CLIENT_INVALIDE', 'siren');
    if (!(c.longueur_compte >= 4 && c.longueur_compte <= 12)) throw C.erreurContrat('CLIENT_INVALIDE', 'longueur_compte');
    if (!Array.isArray(c.exercices) || !c.exercices.length) throw C.erreurContrat('CLIENT_INVALIDE', 'exercices');
    var ex = c.exercices.slice().sort(function (a, b) { return a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0; });
    ex.forEach(function (e, i) {
      if (!e.id || !(e.debut <= e.fin) || (e.statut !== 'OUVERT' && e.statut !== 'CLOTURE')) throw C.erreurContrat('CLIENT_INVALIDE', 'exercices');
      if (i > 0 && !(ex[i - 1].fin < e.debut)) throw C.erreurContrat('CLIENT_INVALIDE', 'exercices');
    });
    return true;
  }

  function validerPerimetre(per, client) {
    if (!per || !per.exercice_id || !per.du || !per.au) throw C.erreurContrat('PERIMETRE_INVALIDE', 'perimetre');
    var ex = client.exercices.filter(function (e) { return e.id === per.exercice_id; })[0];
    if (!ex) throw C.erreurContrat('PERIMETRE_INVALIDE', 'exercice_id');
    if (!(ex.debut <= per.du && per.du <= per.au && per.au <= ex.fin)) throw C.erreurContrat('PERIMETRE_INVALIDE', 'dates');
    return ex;
  }

  /**
   * Correspondance exacte (sensible à la casse, après normTexte) de chaque colonne de l'en-tête.
   * Toute colonne doit figurer dans `colonnes` ou `colonnes_ignorees`.
   * @returns {{ok: boolean, index: Object<string, number>, erreurs: {motif: string, colonne: string}[]}}
   */
  function mapperEntete(entete, profil) {
    var parSource = {};
    Object.keys(profil.colonnes).forEach(function (src) { parSource[Normalisation.normTexte(src)] = profil.colonnes[src]; });
    var ignorees = {};
    (profil.colonnes_ignorees || []).forEach(function (src) { ignorees[Normalisation.normTexte(src)] = true; });

    var index = {};
    var erreurs = [];
    entete.forEach(function (nom, i) {
      var k = Normalisation.normTexte(nom);
      if (ignorees[k]) return;
      var champ = parSource[k];
      if (!champ) { erreurs.push({ motif: 'COLONNE_INCONNUE', colonne: k }); return; }
      if (index[champ] !== undefined) { erreurs.push({ motif: 'COLONNE_DUPLIQUEE', colonne: k }); return; }
      index[champ] = i;
    });
    Object.keys(profil.colonnes).forEach(function (src) {
      var champ = profil.colonnes[src];
      if (index[champ] === undefined) erreurs.push({ motif: 'COLONNE_MANQUANTE', colonne: Normalisation.normTexte(src) });
    });
    return { ok: erreurs.length === 0, index: index, erreurs: erreurs };
  }

  return {
    validerProfil: validerProfil,
    validerClient: validerClient,
    validerPerimetre: validerPerimetre,
    mapperEntete: mapperEntete
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Normalisation !== 'undefined' ? Normalisation : require('./normalisation')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Profil;
