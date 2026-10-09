/**
 * Constantes du modèle : versions, champs, statuts, codes d'anomalie et gravités, erreurs de contrat.
 * Source unique : toute version de règle entre dans les empreintes de dérogation (A5).
 */
var Constantes = (function () {
  'use strict';

  /** regles_v2 : arbitrages P1–P7 du 2026-10-09 (montants négatifs non reclassés, identité FEC, décimales nulles…). */
  var VERSION_REGLES = 'regles_v2';
  var VERSION_EMPREINTE = 'v1';
  var VERSION_NORMALISATION = 'norm_v2';

  /** Champs source qu'un profil peut mapper (cible de `profil.colonnes`). */
  var CHAMPS_SOURCE = [
    'journal_code', 'journal_lib', 'ecriture_num', 'ecriture_date', 'compte_num', 'compte_lib',
    'comp_aux_num', 'comp_aux_lib', 'piece_ref', 'piece_date', 'ecriture_lib',
    'debit', 'credit', 'montant', 'sens',
    'ecriture_let', 'date_let', 'valid_date', 'montant_devise', 'idevise'
  ];

  /** Champs indispensables à tout profil (les montants dépendent du mode de sens). */
  var CHAMPS_INDISPENSABLES = ['journal_code', 'ecriture_num', 'ecriture_date', 'compte_num', 'ecriture_lib'];

  /** Un FEC expose ses 18 colonnes (Debit/Credit ou Montant/Sens). */
  var CHAMPS_FEC = [
    'journal_code', 'journal_lib', 'ecriture_num', 'ecriture_date', 'compte_num', 'compte_lib',
    'comp_aux_num', 'comp_aux_lib', 'piece_ref', 'piece_date', 'ecriture_lib',
    'ecriture_let', 'date_let', 'valid_date', 'montant_devise', 'idevise'
  ];

  /** Champs d'une ligne active, dans l'ordre de sérialisation de hLigne (contrat §5.3, 36 champs). */
  var CHAMPS_ACTIF = [
    'client_id', 'exercice_id', 'cle_ecriture', 'ligne_uid', 'version', 'statut',
    'journal_code', 'journal_lib', 'ecriture_num', 'ecriture_date', 'compte_num', 'compte_lib',
    'comp_aux_num', 'comp_aux_lib', 'piece_ref', 'piece_date', 'ecriture_lib',
    'debit_cts', 'credit_cts', 'ecriture_let', 'date_let', 'valid_date', 'montant_devise_cts', 'idevise',
    'montant_cts', 'compte_num_source', 'source_type', 'profil_id', 'profil_version',
    'first_import_id', 'source_import_id', 'source_rang', 'last_publication_id', 'h_fond', 'h_desc', 'h_let'
  ];

  var STATUTS = {
    NOUVELLE: 'NOUVELLE', INCHANGEE: 'INCHANGEE', MODIFIEE: 'MODIFIEE', ABSENTE: 'ABSENTE',
    COLLISION: 'COLLISION', DOUBLON_INTRA: 'DOUBLON_INTRA', REIMPORT_FICHIER: 'REIMPORT_FICHIER'
  };
  var SOUS_TYPES = ['M_FOND', 'M_DATE', 'M_DESC', 'M_LET'];

  /** Motifs de rejet de ligne (aucune valeur source n'est conservée dans un rejet). */
  var MOTIFS_REJET = ['GUILLEMET', 'COLONNES', 'CHP_VIDE', 'DATE', 'MONTANT', 'PRECISION', 'DC_DOUBLE',
    'SENS_INCONNU', 'COMPTE_NON_NUM', 'COMPTE_LONG', 'CAR_INTERDIT'];

  /**
   * Codes d'anomalie : gravité par défaut (§17 du cahier des charges, arbitrages P1–P7) et reconductibilité (A5).
   * BND : bloquant non dérogeable · B : bloquant dérogeable · A : avertissement à acquitter · I : information.
   */
  var CODES = {
    CLI_MISMATCH: { gravite: 'BND' },
    CLI_IDENTITE_NON_CONFIRMEE: { gravite: 'B' },
    CLI_NOM_FEC_NON_CONFORME: { gravite: 'A' },
    STR_ENCODAGE: { gravite: 'BND' },
    STR_ENTETE: { gravite: 'BND' },
    REJ_LIGNES: { gravite: 'BND' },
    SYS_ACTIF_ALTERE: { gravite: 'BND' },
    PRF_CHANGEMENT: { gravite: 'BND' },
    PER_HORS_PERIMETRE: { gravite: 'BND' },
    IDN_COLLISION: { gravite: 'BND' },
    CPT_COLLISION_PADDING: { gravite: 'BND' },
    REC_LIGNES: { gravite: 'BND' },
    REC_TOTAUX: { gravite: 'BND' },
    REC_MIROIR: { gravite: 'BND' },
    EQU_GLOBAL: { gravite: 'BND' }, // B pour un grand livre (controles.js)
    EQU_ECRITURE: { gravite: 'B' },
    PER_CLOTURE: { gravite: 'B' },
    VOL_SUPPR_MASSE: { gravite: 'B' },
    CPT_CLASSE: { gravite: 'B' },
    REC_TOTAL_SAISI: { gravite: 'B', reconductible: false }, // P2 : dérogation exceptionnelle, jamais reconduite
    IDN_ABSENTE: { gravite: 'A' }, // B sur exercice clôturé (P5)
    IDN_MOD_FOND: { gravite: 'A' },
    IDN_DEVALIDEE: { gravite: 'A' },
    IDN_DOUBLON_INTRA: { gravite: 'A' },
    IDN_MOD_DESC: { gravite: 'I' },
    IDN_MOD_LET: { gravite: 'I' },
    IDN_REAPPARITION: { gravite: 'I' },
    MNT_NUL: { gravite: 'I' },
    MNT_NEG: { gravite: 'I' },
    MNT_DECIMALES_NULLES: { gravite: 'I' },
    SEC_NEUTRALISE: { gravite: 'I' }
  };

  /** Refus de publication et d'annulation (contrat §4.9 et §7 ; PUB_ABSENTE_CLOTURE_NON_MOTIVEE : P5). */
  var REFUS = [
    'PUB_VALIDATION_ABSENTE', 'PUB_CHECKLIST', 'PUB_STAGING_MODIFIE', 'PUB_BASE_MODIFIEE', 'PUB_BND_OUVERT',
    'PUB_B_NON_DEROGE', 'PUB_DEROGATION_INVALIDE', 'PUB_ACQUITTEMENT_INVALIDE', 'PUB_A_NON_ACQUITTE',
    'PUB_ABSENTE_SANS_DECISION', 'PUB_ABSENTE_CLOTURE_NON_MOTIVEE', 'PUB_IMPORT_EN_COURS', 'PUB_REC_PUBLICATION',
    'PUB_REIMPORT', 'ANN_PAS_DERNIERE', 'ANN_DEJA_ANNULEE', 'ANN_TYPE', 'ANN_IMPORT_EN_COURS',
    'ANN_ACTIF_ALTERE', 'ANN_VERIFICATION', 'ANN_TAMPON_DIVERGENT'
  ];

  var MOTIF_MIN = 20;
  var CHECKLIST = ['fichier_plus_recent', 'variations_expliquees', 'decisions_revues'];

  /**
   * Erreur de contrat : argument ou paramétrage invalide (jamais un problème de données).
   * Le message est le code seul : aucune donnée comptable, aucun nom de fichier (S8).
   */
  function erreurContrat(code, champ) {
    var e = new Error(code);
    e.name = 'ErreurContrat';
    e.code = code;
    e.champ = champ || '';
    return e;
  }

  return {
    VERSION_REGLES: VERSION_REGLES,
    VERSION_EMPREINTE: VERSION_EMPREINTE,
    VERSION_NORMALISATION: VERSION_NORMALISATION,
    CHAMPS_SOURCE: CHAMPS_SOURCE,
    CHAMPS_INDISPENSABLES: CHAMPS_INDISPENSABLES,
    CHAMPS_FEC: CHAMPS_FEC,
    CHAMPS_ACTIF: CHAMPS_ACTIF,
    STATUTS: STATUTS,
    SOUS_TYPES: SOUS_TYPES,
    MOTIFS_REJET: MOTIFS_REJET,
    CODES: CODES,
    REFUS: REFUS,
    MOTIF_MIN: MOTIF_MIN,
    CHECKLIST: CHECKLIST,
    erreurContrat: erreurContrat
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Constantes;
