/**
 * Lecture et normalisation d'un fichier : texte décodé → lignes canoniques, rejets, compteurs.
 * Aucune classification ici. P3 : un montant négatif reste dans sa colonne, sans reclassement.
 */
var Lecture = (function (C, Normalisation, Csv, Profil, Identite) {
  'use strict';

  /**
   * @param {{texte: string, nomFichier: string, profil: object, client: object, perimetre: object,
   *          import_id: string, file_sha256: string}} e
   */
  function normaliserFichier(e) {
    if (!e || typeof e.texte !== 'string') throw C.erreurContrat('ARGUMENT_MANQUANT', 'texte');
    var profil = e.profil;
    var v = Profil.validerProfil(profil);
    if (!v.ok) throw C.erreurContrat('PROFIL_INVALIDE', v.erreurs[0].champ);
    Profil.validerClient(e.client);
    Profil.validerPerimetre(e.perimetre, e.client);

    var r = {
      structure_ok: true,
      anomaliesStructure: [],
      bom: false,
      entete: [],
      lignes: [],
      rejets: [],
      lignesRejetees: [],
      horsPerimetre: [],
      montants_bruts: [],
      compteurs: { lignes_physiques: 0, lignes_couvertes: 0, lues: 0, normalisees: 0, rejetees: 0, vides: 0 },
      totaux: { debit_cts: 0, credit_cts: 0 },
      infos: { montants_negatifs: [], montants_nuls: [], decimales_nulles: [], a_neutraliser: [] },
      comptesSources: {}
    };

    Normalisation.verifierEncodage(e.texte).forEach(function (motif) {
      r.anomaliesStructure.push({ code: 'STR_ENCODAGE', motif: motif, colonne: '' });
    });

    var csv = Csv.parseCsv(e.texte, { separateur: profil.separateur });
    r.bom = csv.bom;
    r.entete = csv.entete.map(Normalisation.normTexte);
    r.compteurs.lignes_physiques = csv.lignesPhysiques;
    r.compteurs.lignes_couvertes = csv.entete.length || csv.enregistrements.length ? 1 : 0;
    csv.erreurs.forEach(function (x) { r.anomaliesStructure.push({ code: 'STR_ENTETE', motif: 'GUILLEMET', colonne: 'ligne ' + x.rang }); });

    var mapping = Profil.mapperEntete(csv.entete, profil);
    mapping.erreurs.forEach(function (x) {
      var msg = x.colonne;
      if (x.motif === 'COLONNE_MANQUANTE' && profil.colonnes[x.colonne] === 'ecriture_num') msg += ' — numéro d\'écriture requis (A1) : exporter le FEC';
      r.anomaliesStructure.push({ code: 'STR_ENTETE', motif: x.motif, colonne: msg });
    });
    r.structure_ok = r.anomaliesStructure.length === 0;

    csv.enregistrements.forEach(function (enr) {
      r.compteurs.lues++;
      r.compteurs.lignes_couvertes += enr.ligneFin - enr.rang + 1;
      if (enr.vide) { r.compteurs.vides++; return; }
      if (!r.structure_ok) return; // encodage ou en-tête défaillant : aucune ligne n'est interprétée
      var n = normaliserEnregistrement(enr, csv.entete.length, mapping.index, profil, e);
      if (n.rejets.length) {
        Array.prototype.push.apply(r.rejets, n.rejets);
        r.lignesRejetees.push(enr.rang);
        r.compteurs.rejetees++;
        return;
      }
      var l = n.ligne;
      r.compteurs.normalisees++;
      r.totaux.debit_cts += l.debit_cts;
      r.totaux.credit_cts += l.credit_cts;
      if (l.debit_cts < 0 || l.credit_cts < 0) r.infos.montants_negatifs.push(enr.rang);
      if (l.debit_cts === 0 && l.credit_cts === 0) r.infos.montants_nuls.push(enr.rang);
      if (n.decimalesNulles) r.infos.decimales_nulles.push(enr.rang);
      if (n.aNeutraliser) r.infos.a_neutraliser.push(enr.rang);
      if (l.ecriture_date < e.perimetre.du || l.ecriture_date > e.perimetre.au) r.horsPerimetre.push(enr.rang);
      var sources = r.comptesSources[l.compte_num] || (r.comptesSources[l.compte_num] = []);
      if (sources.indexOf(n.compact) === -1) sources.push(n.compact);
      r.montants_bruts.push(n.bruts);
      r.lignes.push(l);
    });
    if (!r.structure_ok) r.compteurs.rejetees = r.compteurs.lues - r.compteurs.vides;
    return r;
  }

  function normaliserEnregistrement(enr, nbColonnes, index, profil, e) {
    var rejets = [];
    function rejet(motif, champ) { rejets.push({ rang: enr.rang, motif: motif, champ: champ || '' }); }
    if (enr.champs.length !== nbColonnes) { rejet('COLONNES'); return { rejets: rejets }; }
    function brut(champ) { return index[champ] === undefined ? '' : enr.champs[index[champ]]; }
    function exiger(champ, valeur) { if (valeur === '') rejet('CHP_VIDE', champ); }
    function date(champ, obligatoire) {
      var d = Normalisation.parseDate(brut(champ), profil.format_date);
      if (!d.ok) { rejet(d.motif, champ); return ''; }
      if (obligatoire) exiger(champ, d.iso);
      return d.iso;
    }
    var decimalesNulles = false;
    function montant(champ) {
      var m = Normalisation.parseMontant(brut(champ), profil.decimal);
      if (!m.ok) { rejet(m.motif, champ); return null; }
      if (m.decimalesNulles) decimalesNulles = true;
      return m;
    }

    var compte = Normalisation.normCompte(brut('compte_num'), e.client.longueur_compte);
    var l = {
      client_id: e.client.client_id,
      exercice_id: e.perimetre.exercice_id,
      cle_ecriture: '',
      journal_code: Normalisation.normCode(brut('journal_code')),
      journal_lib: Normalisation.normTexte(brut('journal_lib')),
      ecriture_num: Normalisation.normTexte(brut('ecriture_num')),
      ecriture_date: date('ecriture_date', true),
      compte_num: compte.ok ? compte.compte : '',
      compte_lib: Normalisation.normTexte(brut('compte_lib')),
      comp_aux_num: Normalisation.normAuxiliaire(brut('comp_aux_num')),
      comp_aux_lib: Normalisation.normTexte(brut('comp_aux_lib')),
      piece_ref: Normalisation.normTexte(brut('piece_ref')),
      piece_date: date('piece_date', false),
      ecriture_lib: Normalisation.normTexte(brut('ecriture_lib')),
      debit_cts: 0,
      credit_cts: 0,
      ecriture_let: Normalisation.normTexte(brut('ecriture_let')),
      date_let: date('date_let', false),
      valid_date: date('valid_date', false),
      montant_devise_cts: null,
      idevise: Normalisation.normCode(brut('idevise')),
      montant_cts: 0,
      compte_num_source: compte.ok ? compte.source : Normalisation.normTexte(brut('compte_num')),
      source_type: profil.type,
      profil_id: profil.profil_id,
      profil_version: profil.version,
      source_import_id: e.import_id || '',
      source_rang: enr.rang
    };
    exiger('journal_code', l.journal_code);
    exiger('ecriture_num', l.ecriture_num);
    exiger('ecriture_lib', l.ecriture_lib);
    if (profil.type === 'FEC') exiger('piece_ref', l.piece_ref);
    if (l.journal_code.indexOf('|') !== -1) rejet('CAR_INTERDIT', 'journal_code');
    if (l.ecriture_num.indexOf('|') !== -1) rejet('CAR_INTERDIT', 'ecriture_num');
    if (!compte.ok) rejet(compte.motif, 'compte_num');
    else if (compte.vide) rejet('CHP_VIDE', 'compte_num');
    if ((profil.lettrage_vide || []).indexOf(l.ecriture_let) !== -1) l.ecriture_let = '';

    var bruts;
    if (profil.mode_sens === 'DEBIT_CREDIT') {
      bruts = { rang: enr.rang, debit: brut('debit'), credit: brut('credit'), montant: '', sens: '' };
      var d = montant('debit');
      var c = montant('credit');
      if (d && c) {
        if (d.vide && c.vide) rejet('CHP_VIDE', 'debit');
        else if (d.cts !== 0 && c.cts !== 0) rejet('DC_DOUBLE', 'debit');
        // P3 : valeur d'origine conservée dans sa colonne, même négative (aucun reclassement automatique).
        l.debit_cts = d.cts;
        l.credit_cts = c.cts;
      }
    } else {
      bruts = { rang: enr.rang, debit: '', credit: '', montant: brut('montant'), sens: brut('sens') };
      var m = montant('montant');
      var sens = Normalisation.normTexte(brut('sens')).toUpperCase();
      var estD = contient(profil.valeurs_sens.D, sens);
      var estC = contient(profil.valeurs_sens.C, sens);
      if (estD === estC) rejet('SENS_INCONNU', 'sens');
      if (m && m.vide) rejet('CHP_VIDE', 'montant');
      if (m && estD !== estC) {
        if (estD) l.debit_cts = m.cts; else l.credit_cts = m.cts;
      }
    }
    l.montant_cts = l.debit_cts - l.credit_cts;

    var md = montant('montant_devise');
    if (md && !md.vide) l.montant_devise_cts = md.cts;

    if (rejets.length) return { rejets: rejets };
    l.cle_ecriture = Identite.cleEcriture(l, profil);
    var aNeutraliser = ['journal_lib', 'compte_lib', 'comp_aux_lib', 'piece_ref', 'ecriture_lib', 'ecriture_num']
      .some(function (k) { return Normalisation.doitEtreNeutralise(l[k]); });
    return { rejets: [], ligne: l, compact: compte.compact, bruts: bruts, decimalesNulles: decimalesNulles, aNeutraliser: aNeutraliser };
  }

  function contient(liste, valeur) {
    for (var i = 0; i < liste.length; i++) if (String(liste[i]).toUpperCase() === valeur) return true;
    return false;
  }

  return { normaliserFichier: normaliserFichier };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Normalisation !== 'undefined' ? Normalisation : require('./normalisation'),
  typeof Csv !== 'undefined' ? Csv : require('./csv'),
  typeof Profil !== 'undefined' ? Profil : require('./profil'),
  typeof Identite !== 'undefined' ? Identite : require('./identite')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Lecture;
