/**
 * Modèle canonique : champs, versions des règles, gravités des anomalies.
 */
var Modele = (function () {
  'use strict';

  var VERSION_REGLES = 'regles_v1';
  var VERSION_EMPREINTE = 'v1';

  /** Champs source qu'un profil peut mapper (cible de `profil.colonnes`). */
  var CHAMPS_SOURCE = [
    'journal_code', 'journal_lib', 'ecriture_num', 'ecriture_date', 'compte_num', 'compte_lib',
    'comp_aux_num', 'comp_aux_lib', 'piece_ref', 'piece_date', 'ecriture_lib',
    'debit', 'credit', 'montant', 'sens',
    'ecriture_let', 'date_let', 'valid_date', 'montant_devise', 'idevise'
  ];

  /** Champs indispensables à tout profil (les montants sont vérifiés selon le mode de sens). */
  var CHAMPS_INDISPENSABLES = ['journal_code', 'ecriture_num', 'ecriture_date', 'compte_num', 'ecriture_lib'];

  /** Un FEC doit exposer ses 18 colonnes (Debit/Credit ou Montant/Sens). */
  var CHAMPS_FEC = [
    'journal_code', 'journal_lib', 'ecriture_num', 'ecriture_date', 'compte_num', 'compte_lib',
    'comp_aux_num', 'comp_aux_lib', 'piece_ref', 'piece_date', 'ecriture_lib',
    'ecriture_let', 'date_let', 'valid_date', 'montant_devise', 'idevise'
  ];

  /** Ordre des champs d'une ligne canonique (sérialisation, checksum). */
  var CHAMPS_LIGNE = [
    'client_id', 'exercice_id', 'cle_ecriture',
    'journal_code', 'journal_lib', 'ecriture_num', 'ecriture_date', 'compte_num', 'compte_lib',
    'comp_aux_num', 'comp_aux_lib', 'piece_ref', 'piece_date', 'ecriture_lib',
    'debit_cts', 'credit_cts', 'ecriture_let', 'date_let', 'valid_date', 'montant_devise_cts', 'idevise',
    'compte_num_source', 'source_type'
  ];

  var GRAVITES = { BND: 'BND', B: 'B', A: 'A', I: 'I' };

  /** Gravité par défaut de chaque code (§17 du cahier des charges). */
  var GRAVITE_PAR_CODE = {
    CLI_MISMATCH: 'BND',
    STR_ENCODAGE: 'BND',
    STR_ENTETE: 'BND',
    REJ_LIGNES: 'BND',
    SYS_ACTIF_ALTERE: 'BND',
    PRF_CHANGEMENT: 'BND',
    PER_HORS_PERIMETRE: 'BND',
    IDN_COLLISION: 'BND',
    CPT_COLLISION_PADDING: 'BND',
    REC_LIGNES: 'BND',
    REC_TOTAUX: 'BND',
    REC_MIROIR: 'BND',
    EQU_GLOBAL: 'BND', // B pour un grand livre (voir controles.js)
    EQU_ECRITURE: 'B',
    PER_CLOTURE: 'B',
    VOL_SUPPR_MASSE: 'B',
    CPT_CLASSE: 'B',
    REC_TOTAL_SAISI: 'B',
    IDN_ABSENTE: 'A',
    IDN_MOD_FOND: 'A',
    IDN_DEVALIDEE: 'A',
    IDN_DOUBLON_INTRA: 'A',
    IDN_MOD_DESC: 'I',
    IDN_MOD_LET: 'I',
    IDN_REAPPARITION: 'I',
    MNT_NUL: 'I',
    MNT_NEG: 'I',
    SEC_NEUTRALISE: 'I'
  };

  var STATUTS = {
    NOUVELLE: 'NOUVELLE',
    INCHANGEE: 'INCHANGEE',
    MODIFIEE: 'MODIFIEE',
    ABSENTE: 'ABSENTE',
    COLLISION: 'COLLISION',
    DOUBLON_INTRA: 'DOUBLON_INTRA',
    REIMPORT_FICHIER: 'REIMPORT_FICHIER'
  };

  var SOUS_TYPES = { M_FOND: 'M_FOND', M_DATE: 'M_DATE', M_DESC: 'M_DESC', M_LET: 'M_LET' };

  return {
    VERSION_REGLES: VERSION_REGLES,
    VERSION_EMPREINTE: VERSION_EMPREINTE,
    CHAMPS_SOURCE: CHAMPS_SOURCE,
    CHAMPS_INDISPENSABLES: CHAMPS_INDISPENSABLES,
    CHAMPS_FEC: CHAMPS_FEC,
    CHAMPS_LIGNE: CHAMPS_LIGNE,
    GRAVITES: GRAVITES,
    GRAVITE_PAR_CODE: GRAVITE_PAR_CODE,
    STATUTS: STATUTS,
    SOUS_TYPES: SOUS_TYPES
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Modele;
