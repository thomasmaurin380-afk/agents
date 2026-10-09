/**
 * Lecture et normalisation d'un fichier : texte décodé → lignes canoniques + rejets + compteurs.
 * Aucune décision de classification ici : seulement la mise au format commun.
 */
var Lecture = (function (Csv, Normalisation, Profil, Identite) {
  'use strict';

  /**
   * @param {{texte: string, nomFichier: string, profil: object, client: object,
   *          perimetre: {exercice_id: string, du: string, au: string}}} entree
   * @returns {{
   *   structureValide: boolean,
   *   anomaliesStructure: {code: string, message: string}[],
   *   bom: boolean,
   *   lignes: object[],
   *   rejets: {rang: number, codes: string[]}[],
   *   horsPerimetre: number[],
   *   compteurs: {lues: number, vides: number, rejetees: number, valides: number,
   *               lignes_physiques: number, lignes_couvertes: number},
   *   totauxLecture: {debit_cts: number, credit_cts: number},
   *   infos: {montants_negatifs: number, montants_nuls: number, a_neutraliser: number},
   *   comptesSources: Object<string, string[]>
   * }}
   */
  function normaliserFichier(entree) {
    var profil = entree.profil;
    var client = entree.client;
    var perimetre = entree.perimetre;
    Profil.validerProfil(profil);
    verifierPerimetre(client, perimetre);

    var resultat = {
      structureValide: true,
      anomaliesStructure: [],
      bom: false,
      lignes: [],
      rejets: [],
      horsPerimetre: [],
      compteurs: { lues: 0, vides: 0, rejetees: 0, valides: 0, lignes_physiques: 0, lignes_couvertes: 0 },
      totauxLecture: { debit_cts: 0, credit_cts: 0 },
      infos: { montants_negatifs: 0, montants_nuls: 0, a_neutraliser: 0 },
      comptesSources: {},
      montantsBruts: []
    };

    Normalisation.verifierEncodage(entree.texte).forEach(function (code) {
      resultat.anomaliesStructure.push({ code: 'STR_ENCODAGE', message: code });
    });

    var csv = Csv.parseCsv(entree.texte, { separateur: profil.separateur });
    resultat.bom = csv.bom;
    resultat.compteurs.lignes_physiques = csv.lignesPhysiques;
    resultat.compteurs.lignes_couvertes = csv.entete.length || csv.enregistrements.length ? 1 : 0;
    csv.erreurs.forEach(function (e) {
      resultat.anomaliesStructure.push({ code: 'STR_ENTETE', message: 'guillemet non fermé (ligne ' + e.rang + ')' });
    });

    var mapping = Profil.mapperEntete(csv.entete, profil);
    mapping.anomalies.forEach(function (a) { resultat.anomaliesStructure.push(a); });
    resultat.structureValide = resultat.anomaliesStructure.length === 0;
    var interpreter = resultat.structureValide; // encodage ou en-tête défaillant : aucune ligne n'est interprétée

    csv.enregistrements.forEach(function (enr) {
      resultat.compteurs.lues++;
      resultat.compteurs.lignes_couvertes += enr.ligneFin - enr.rang + 1;
      if (enr.vide) { resultat.compteurs.vides++; return; }
      if (!interpreter) return;
      var r = normaliserEnregistrement(enr, csv.entete.length, mapping.index, profil, client, perimetre);
      if (r.codes.length) {
        resultat.rejets.push({ rang: enr.rang, codes: r.codes });
        resultat.compteurs.rejetees++;
        return;
      }
      var ligne = r.ligne;
      resultat.compteurs.valides++;
      resultat.totauxLecture.debit_cts += ligne.debit_cts;
      resultat.totauxLecture.credit_cts += ligne.credit_cts;
      if (r.negatif) resultat.infos.montants_negatifs++;
      if (ligne.debit_cts === 0 && ligne.credit_cts === 0) resultat.infos.montants_nuls++;
      if (r.aNeutraliser) resultat.infos.a_neutraliser++;
      if (ligne.ecriture_date < perimetre.du || ligne.ecriture_date > perimetre.au) resultat.horsPerimetre.push(enr.rang);
      var sources = resultat.comptesSources[ligne.compte_num] || (resultat.comptesSources[ligne.compte_num] = []);
      if (sources.indexOf(ligne.compte_num_source) === -1) sources.push(ligne.compte_num_source);
      resultat.montantsBruts.push(r.montantsBruts);
      resultat.lignes.push(ligne);
    });
    if (!interpreter) resultat.compteurs.rejetees = resultat.compteurs.lues - resultat.compteurs.vides;

    return resultat;
  }

  function verifierPerimetre(client, perimetre) {
    if (!client || !client.client_id) throw new Error('Client absent');
    if (!(client.longueur_compte > 0)) throw new Error('longueur_compte du client invalide');
    if (!perimetre || !perimetre.exercice_id || !perimetre.du || !perimetre.au) throw new Error('Périmètre obligatoire (exercice_id, du, au)');
    var ex = (client.exercices || []).filter(function (e) { return e.id === perimetre.exercice_id; })[0];
    if (!ex) throw new Error('Exercice inconnu : ' + perimetre.exercice_id);
    if (perimetre.du > perimetre.au || perimetre.du < ex.debut || perimetre.au > ex.fin) {
      throw new Error('Périmètre hors de l\'exercice ' + ex.id);
    }
  }

  function normaliserEnregistrement(enr, nbColonnes, index, profil, client, perimetre) {
    var codes = [];
    if (enr.champs.length !== nbColonnes) return { codes: ['STR_COLONNES'] };
    function brut(champ) { return index[champ] === undefined ? '' : enr.champs[index[champ]]; }
    function exiger(champ, valeur) { if (valeur === '') codes.push('CHP_OBLIG:' + champ); }
    function date(champ, obligatoire) {
      var d = Normalisation.parseDate(brut(champ), profil.format_date);
      if (!d.ok) { codes.push(d.code + ':' + champ); return ''; }
      if (obligatoire) exiger(champ, d.iso);
      return d.iso;
    }

    var ligne = {
      client_id: client.client_id,
      exercice_id: perimetre.exercice_id,
      cle_ecriture: '',
      journal_code: Normalisation.normCode(brut('journal_code')),
      journal_lib: Normalisation.normTexte(brut('journal_lib')),
      ecriture_num: Normalisation.normTexte(brut('ecriture_num')),
      ecriture_date: date('ecriture_date', true),
      compte_num: '',
      compte_num_source: Normalisation.normTexte(brut('compte_num')).replace(/[\s.\-]/g, '').toUpperCase(),
      source_type: profil.type,
      compte_lib: Normalisation.normTexte(brut('compte_lib')),
      comp_aux_num: Normalisation.normAuxiliaire(brut('comp_aux_num')),
      comp_aux_lib: Normalisation.normTexte(brut('comp_aux_lib')),
      piece_ref: Normalisation.normTexte(brut('piece_ref')),
      piece_date: date('piece_date', false),
      ecriture_lib: Normalisation.normTexte(brut('ecriture_lib')),
      debit_cts: 0,
      credit_cts: 0,
      montant_cts: 0,
      ecriture_let: Normalisation.normTexte(brut('ecriture_let')),
      date_let: date('date_let', false),
      valid_date: date('valid_date', false),
      montant_devise_cts: 0,
      idevise: Normalisation.normCode(brut('idevise')),
      source_rang: enr.rang
    };
    exiger('journal_code', ligne.journal_code);
    exiger('ecriture_num', ligne.ecriture_num);
    exiger('ecriture_lib', ligne.ecriture_lib);
    if (profil.type === 'FEC') exiger('piece_ref', ligne.piece_ref);

    var compte = Normalisation.normCompte(brut('compte_num'), client.longueur_compte);
    if (!compte.ok) codes.push(compte.code);
    else if (compte.vide) codes.push('CHP_OBLIG:compte_num');
    else ligne.compte_num = compte.compte;

    if ((profil.lettrage_vide || []).indexOf(ligne.ecriture_let) !== -1) ligne.ecriture_let = '';

    var negatif = false;
    if (profil.mode_sens === 'DEBIT_CREDIT') {
      var d = Normalisation.parseMontant(brut('debit'), profil.decimal);
      var c = Normalisation.parseMontant(brut('credit'), profil.decimal);
      if (!d.ok) codes.push(d.code + ':debit');
      if (!c.ok) codes.push(c.code + ':credit');
      if (d.ok && c.ok) {
        if (d.cts !== 0 && c.cts !== 0) codes.push('MNT_DC_DOUBLE');
        negatif = d.negatif || c.negatif;
        ligne.montant_cts = d.cts - c.cts;
      }
    } else {
      var m = Normalisation.parseMontant(brut('montant'), profil.decimal);
      if (!m.ok) codes.push(m.code + ':montant');
      var sens = Normalisation.normTexte(brut('sens')).toUpperCase();
      var estD = contientSans(profil.valeurs_sens.D, sens);
      var estC = contientSans(profil.valeurs_sens.C, sens);
      if (estD === estC) codes.push('SENS_INCONNU');
      if (m.ok && estD !== estC) {
        negatif = m.negatif;
        ligne.montant_cts = estD ? m.cts : -m.cts;
      }
    }
    ligne.debit_cts = ligne.montant_cts > 0 ? ligne.montant_cts : 0;
    ligne.credit_cts = ligne.montant_cts < 0 ? -ligne.montant_cts : 0;

    var md = Normalisation.parseMontant(brut('montant_devise'), profil.decimal);
    if (!md.ok) codes.push(md.code + ':montant_devise');
    else ligne.montant_devise_cts = md.cts;

    if (codes.length) return { codes: codes };
    ligne.cle_ecriture = Identite.cleEcriture(ligne, profil);
    var aNeutraliser = ['journal_lib', 'compte_lib', 'comp_aux_lib', 'piece_ref', 'ecriture_lib', 'ecriture_num']
      .some(function (k) { return Normalisation.doitEtreNeutralise(ligne[k]); });
    var montantsBruts = profil.mode_sens === 'DEBIT_CREDIT'
      ? { rang: enr.rang, debit: brut('debit'), credit: brut('credit') }
      : { rang: enr.rang, montant: brut('montant'), sens: brut('sens') };
    return { codes: [], ligne: ligne, negatif: negatif, aNeutraliser: aNeutraliser, montantsBruts: montantsBruts };
  }

  function contientSans(liste, valeur) {
    for (var i = 0; i < liste.length; i++) {
      if (String(liste[i]).toUpperCase() === valeur) return true;
    }
    return false;
  }

  return { normaliserFichier: normaliserFichier };
})(
  typeof Csv !== 'undefined' ? Csv : require('./csv'),
  typeof Normalisation !== 'undefined' ? Normalisation : require('./normalisation'),
  typeof Profil !== 'undefined' ? Profil : require('./profil'),
  typeof Identite !== 'undefined' ? Identite : require('./identite')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Lecture;
