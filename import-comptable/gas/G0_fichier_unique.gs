/**
 * TEST G0 - IMPORT COMPTABLE - FICHIER UNIQUE (DONNEES FICTIVES UNIQUEMENT)
 *
 * Mode d'emploi : coller ce fichier en entier dans un projet Google Apps Script vide,
 * enregistrer, choisir la fonction testPrototypeFictif, cliquer sur Executer.
 * Le resultat s'affiche dans le journal d'execution : RESULTAT G0 : REUSSI ou ECHEC.
 *
 * Ce code ne lit ni n'ecrit aucun classeur, aucun fichier Drive, aucun e-mail ;
 * il n'appelle aucun service externe et ne demande aucune autorisation.
 * Genere automatiquement par scripts/construire-gas.js - ne pas modifier a la main.
 */
// ===== 14_TestFictif.js =====
/**
 * Premier test Apps Script sur données FICTIVES (jeux S01 puis S03 de l'ingénieur, embarqués dans JeuxFictifs.js).
 *
 * Ce test n'ouvre aucun classeur, aucun fichier Drive et n'appelle aucun service externe : il n'exige aucune
 * autorisation OAuth. Il vérifie dans le moteur V8 d'Apps Script :
 *   1. le Hasher (Utilities.computeDigest) contre les vecteurs de référence ;
 *   2. le chargement du cœur dans l'espace global (ordre de chargement) ;
 *   3. un cycle complet S01 → publication → S03 → publication → annulation, comparé aux résultats obtenus sous Node.
 * Le journal ne contient que des codes, des compteurs, des durées et des empreintes (aucune donnée comptable).
 */
function testPrototypeFictif() {
  var t0 = new Date().getTime();
  var journal = [];
  function noter(etape, valeur) { journal.push(etape + ' : ' + JSON.stringify(valeur)); }
  var J = JeuxFictifs;
  var ecarts = [];
  function verifier(libelle, obtenu, attendu) {
    if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) ecarts.push(libelle + ' : obtenu ' + JSON.stringify(obtenu) + ', attendu ' + JSON.stringify(attendu));
  }

  Empreinte.verifierHasher(HasherGas);
  noter('hasher', 'vecteurs de référence conformes');

  function cycle(etat, jeu, importId, publicationId) {
    var a = Pipeline.analyserImport({
      etat: etat, fichier: { texte: jeu.texte, nomFichier: jeu.nom_fichier, sha256: jeu.sha256 }, profil: J.profil, client: J.client,
      perimetre: jeu.perimetre, identite: { dossier_client_id: J.client.client_id }, import_id: importId, horodatage: J.horodatage.valide,
      hasher: HasherGas
    });
    var validee = Pipeline.valider(etat, a, choixTest(a), HasherGas);
    var r = Pipeline.publier(etat, a, validee, { publication_id: publicationId, horodatage: J.horodatage.valide }, HasherGas);
    if (!r.ok) throw new Error('PUBLICATION_REFUSEE ' + r.refus.join(','));
    return { analyse: a, etat: r.etat, publication: r.publication };
  }

  var etat0 = Pipeline.etatInitial(J.client.client_id);
  var c1 = cycle(etat0, J.s01, 'IMPORT-S01', 'PUB-1');
  var c2 = cycle(c1.etat, J.s03, 'IMPORT-S03', 'PUB-2');
  var u = Pipeline.annulerDernierePublication(c2.etat, { publication_id: 'ANN-1', horodatage: J.horodatage.valide, tampon_inactif: c1.etat.actif }, HasherGas);
  if (!u.ok) throw new Error('ANNULATION_REFUSEE ' + u.refus.join(','));

  var obtenu = {
    s01_statuts: c1.analyse.comparaison.compteurs.par_statut,
    s03_statuts: c2.analyse.comparaison.compteurs.par_statut,
    s03_anomalies: c2.analyse.anomalies.map(function (x) { return x.code + ':' + x.gravite; }),
    checksum_pub1: c1.publication.checksum_apres,
    checksum_pub2: c2.publication.checksum_apres,
    checksum_apres_annulation: u.publication.checksum_apres,
    nb_lignes_actif_pub2: c2.etat.actif.length
  };
  Object.keys(J.attendu_node).forEach(function (k) { verifier(k, obtenu[k], J.attendu_node[k]); });
  noter('statuts S03', obtenu.s03_statuts);
  noter('checksum après annulation = publication 1', obtenu.checksum_apres_annulation === obtenu.checksum_pub1);
  var resultat = { ok: ecarts.length === 0, ecarts: ecarts, duree_ms: new Date().getTime() - t0, journal: journal };
  // Message lisible en premier : c'est la seule ligne à relever pour le dirigeant.
  Logger.log(resultat.ok
    ? 'RESULTAT G0 : REUSSI - le moteur donne dans Google Apps Script exactement les memes resultats que les tests (duree : ' + resultat.duree_ms + ' ms).'
    : 'RESULTAT G0 : ECHEC - ' + ecarts.length + ' ecart(s) avec les tests. Copier tout le journal et le transmettre.');
  Logger.log(JSON.stringify(resultat, null, 1));
  return resultat;
}

/** Décisions de test « tout traité » (même règle que test/aides.js côté Node). */
function choixTest(a) {
  var J = JeuxFictifs;
  var decisions = [];
  var motif = 'Dérogation de test motivée par le scénario';
  (a.comparaison ? a.comparaison.ecritures : []).forEach(function (e) {
    if (e.statut === 'ABSENTE') decisions.push({ decision_id: 'ABS:' + e.cle, type: 'ABSENTE', import_id: a.import_id, cle: e.cle, choix: 'ACCEPTER', motif: motif, par: 'TEST', le: J.horodatage.valide });
  });
  a.anomalies.filter(function (x) { return x.gravite === 'B' && x.code !== 'IDN_ABSENTE'; }).forEach(function (x) {
    decisions.push({ decision_id: 'DER:' + x.anomalie_id, type: 'DEROGATION', import_id: a.import_id, anomalie_id: x.anomalie_id,
      empreinte_derogation: x.empreinte_derogation, motif: motif, reference: '', par: 'TEST', le: J.horodatage.valide, origine: 'MANUELLE', source_decision_id: '' });
  });
  var parCode = {};
  a.anomalies.filter(function (x) { return x.gravite === 'A' && x.code !== 'IDN_ABSENTE'; }).forEach(function (x) { (parCode[x.code] = parCode[x.code] || []).push(x.anomalie_id); });
  Object.keys(parCode).sort().forEach(function (code) {
    decisions.push({ decision_id: 'ACQ:' + code, type: 'ACQUITTEMENT', import_id: a.import_id, code: code, anomalie_ids: parCode[code], commentaire: 'Revu en test', par: 'TEST', le: J.horodatage.valide });
  });
  return { decisions: decisions, checklist: { fichier_plus_recent: true, variations_expliquees: true, decisions_revues: true },
    validation_id: 'VAL-' + a.import_id, soumis_par: 'TEST', soumis_le: J.horodatage.soumis, valide_par: 'TEST', valide_le: J.horodatage.valide };
}

// ===== 13_HasherGas.js =====
/**
 * Adaptateur Apps Script du port Hasher : SHA-256 du texte encodé en UTF-8, en hexadécimal minuscule.
 * Utilities.computeDigest renvoie des octets signés (-128..127) : conversion explicite en hexadécimal.
 * L'égalité avec les vecteurs de référence est vérifiée par Empreinte.verifierHasher à chaque cas d'usage.
 */
var HasherGas = {
  sha256Hex: function (texte) {
    var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texte), Utilities.Charset.UTF_8);
    var hex = '';
    for (var i = 0; i < octets.length; i++) {
      var h = (octets[i] & 0xff).toString(16);
      hex += h.length === 1 ? '0' + h : h;
    }
    return hex;
  }
};

// ===== 01_constantes.js =====
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

// ===== 02_empreinte.js =====
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

// ===== 03_normalisation.js =====
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

// ===== 04_csv.js =====
/**
 * Lecture CSV (RFC 4180) à partir d'une chaîne déjà décodée.
 *
 * Compatible Node et Apps Script V8 : aucun appel d'API externe.
 * Le décodage des octets (UTF-8, windows-1252) relève de l'adaptateur.
 */
var Csv = (function (C) {
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
    if (typeof texte !== 'string') throw C.erreurContrat('ARGUMENT_MANQUANT', 'texte');
    var sep = options && options.separateur;
    if (typeof sep !== 'string' || sep.length !== 1 || sep === '"' || sep === '\n' || sep === '\r') {
      throw C.erreurContrat('PROFIL_INVALIDE', 'separateur');
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
})(typeof Constantes !== 'undefined' ? Constantes : require('./constantes'));

if (typeof module !== 'undefined' && module.exports) module.exports = Csv;

// ===== 05_profil.js =====
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

// ===== 06_anomalies.js =====
/**
 * Anomalies : création, empreintes d'objet et de dérogation (A5, P1), application des décisions,
 * reconduction des dérogations.
 */
var Anomalies = (function (C, E) {
  'use strict';

  /**
   * @param {string} code
   * @param {{gravite?: string, objet_type?: string, objet_cle?: string, attendu?: *, obtenu?: *, ecart?: *,
   *          nb?: number, rangs?: number[], cles?: string[], mention?: string, message?: string}} [champs]
   */
  function creer(code, champs) {
    champs = champs || {};
    var def = C.CODES[code];
    if (!def) throw C.erreurContrat('ARGUMENT_MANQUANT', 'code');
    var objetType = champs.objet_type || 'FICHIER';
    var objetCle = champs.objet_cle || '';
    return {
      anomalie_id: code + '|' + objetType + '|' + objetCle,
      code: code,
      gravite: champs.gravite || def.gravite,
      objet_type: objetType,
      objet_cle: objetCle,
      attendu: texte(champs.attendu),
      obtenu: texte(champs.obtenu),
      ecart: texte(champs.ecart),
      nb: champs.nb || 0,
      rangs: (champs.rangs || []).slice().sort(function (a, b) { return a - b; }),
      cles: (champs.cles || []).slice().sort(E.comparerTexte),
      mention: champs.mention || '',
      message: champs.message || '',
      reconductible: def.reconductible !== false,
      empreinte_objet: '',
      empreinte_derogation: '',
      statut: 'OUVERTE',
      control_version: C.VERSION_REGLES
    };
  }

  function texte(v) { return v === undefined || v === null ? '' : String(v); }

  /** empreinte_objet = H("objet", [code, objet_type, objet_cle, attendu, obtenu, ecart, Coll("concernees", h)]) */
  function empreinteObjet(anomalie, hConcernees, hasher) {
    return E.H('objet', [anomalie.code, anomalie.objet_type, anomalie.objet_cle, anomalie.attendu, anomalie.obtenu,
      anomalie.ecart, E.Coll('concernees', hConcernees || [], hasher, true)], hasher);
  }

  /**
   * Empreinte de dérogation (A5).
   * P1 : périmètre limité à l'exercice pour une anomalie portant sur une écriture ou un compte (le contenu
   * de l'objet est figé par empreinte_objet) ; exercice + du + au pour une anomalie de niveau fichier,
   * exercice ou actif.
   */
  function empreinteDerogation(anomalie, ctx, hasher) {
    var p = ctx.perimetre;
    var objetPrecis = anomalie.objet_type === 'ECRITURE' || anomalie.objet_type === 'COMPTE';
    var perimetre = objetPrecis ? p.exercice_id : [p.exercice_id, p.du, p.au].join('|');
    return E.H('derogation', [anomalie.code, anomalie.gravite, anomalie.objet_type, anomalie.objet_cle,
      anomalie.empreinte_objet, perimetre, ctx.statut_exercice, ctx.profil_id, ctx.profil_version, C.VERSION_REGLES], hasher);
  }

  function copier(a) {
    var c = {};
    Object.keys(a).forEach(function (k) { c[k] = Array.isArray(a[k]) ? a[k].slice() : a[k]; });
    return c;
  }

  /**
   * Applique les décisions humaines aux anomalies (copies) et signale les décisions invalides.
   * - DEROGATION : anomalie existante de gravité B, empreinte de dérogation égale, motif ≥ 20 caractères, auteur.
   * - ACQUITTEMENT : chaque anomalie listée existe, est de gravité A et du code indiqué.
   * - ABSENTE : vaut acquittement de l'IDN_ABSENTE (A). Sur exercice clôturé (IDN_ABSENTE de gravité B, P5),
   *   la décision elle-même est la validation renforcée : motif ≥ 20 caractères exigé, aucune dérogation séparée.
   * @returns {{anomalies: object[], erreurs: {code: string, decision_id: string}[]}}
   */
  function appliquerDecisions(anomalies, decisions) {
    var parId = {};
    var copies = anomalies.map(function (a) { var c = copier(a); parId[c.anomalie_id] = c; return c; });
    var erreurs = [];
    function motifValide(d) { return String(d.motif || '').trim().length >= C.MOTIF_MIN && !!d.par; }

    (decisions || []).forEach(function (d) {
      if (d.type === 'DEROGATION') {
        var a = parId[d.anomalie_id];
        if (!a || a.gravite !== 'B' || a.empreinte_derogation !== d.empreinte_derogation || !motifValide(d)) {
          erreurs.push({ code: 'PUB_DEROGATION_INVALIDE', decision_id: d.decision_id });
        } else {
          a.statut = 'DEROGEE';
        }
      } else if (d.type === 'ACQUITTEMENT') {
        var ok = Array.isArray(d.anomalie_ids) && d.anomalie_ids.length > 0 && !!d.par && d.anomalie_ids.every(function (id) {
          var x = parId[id];
          return x && x.gravite === 'A' && x.code === d.code;
        });
        if (!ok) erreurs.push({ code: 'PUB_ACQUITTEMENT_INVALIDE', decision_id: d.decision_id });
        else d.anomalie_ids.forEach(function (id) { parId[id].statut = 'ACQUITTEE'; });
      } else if (d.type === 'ABSENTE') {
        var abs = parId['IDN_ABSENTE|ECRITURE|' + d.cle];
        if (!abs) return; // décision sans objet : refus PUB_ABSENTE_SANS_DECISION ou ignorée par la publication
        if (abs.gravite === 'B') {
          if (motifValide(d)) abs.statut = 'DEROGEE';
          else erreurs.push({ code: 'PUB_ABSENTE_CLOTURE_NON_MOTIVEE', decision_id: d.decision_id });
        } else if (String(d.motif || '').trim() && d.par) {
          abs.statut = 'ACQUITTEE';
        }
      } else {
        throw C.erreurContrat('ARGUMENT_MANQUANT', 'decision.type');
      }
    });
    return { anomalies: copies, erreurs: erreurs };
  }

  /**
   * Reconduit les dérogations de la dernière publication appliquée dont l'empreinte est strictement égale à celle
   * d'une anomalie B de l'import courant. Jamais pour BND, A, I, ni pour les codes non reconductibles (P2).
   * @returns {object[]} DecisionDerogation (origine RECONDUCTION)
   */
  function reconduireDerogations(e) {
    var parEmpreinte = {};
    (e.derogations_precedentes || []).forEach(function (d) { parEmpreinte[d.empreinte_derogation] = d; });
    return e.anomalies.filter(function (a) {
      return a.gravite === 'B' && a.reconductible && a.empreinte_derogation && parEmpreinte[a.empreinte_derogation];
    }).map(function (a) {
      var source = parEmpreinte[a.empreinte_derogation];
      return {
        decision_id: 'RECOND:' + e.import_id + ':' + a.anomalie_id,
        type: 'DEROGATION',
        import_id: e.import_id,
        anomalie_id: a.anomalie_id,
        empreinte_derogation: a.empreinte_derogation,
        motif: source.motif,
        reference: source.reference || '',
        par: 'SYSTEME',
        le: e.horodatage || '',
        origine: 'RECONDUCTION',
        source_decision_id: source.decision_id
      };
    });
  }

  return {
    creer: creer,
    empreinteObjet: empreinteObjet,
    empreinteDerogation: empreinteDerogation,
    appliquerDecisions: appliquerDecisions,
    reconduireDerogations: reconduireDerogations
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Anomalies;

// ===== 07_identite.js =====
/**
 * Identité des écritures (clé K2), empreintes de ligne et d'écriture, identifiant de ligne.
 * La clé dit « qui est-ce » ; les empreintes disent « ce que ça contient ».
 */
var Identite = (function (C, E) {
  'use strict';

  var CHAMPS_FOND = ['compte_num', 'comp_aux_num', 'debit_cts', 'credit_cts', 'idevise', 'montant_devise_cts'];
  var CHAMPS_DESC = ['ecriture_lib', 'piece_ref', 'piece_date', 'journal_lib', 'compte_lib', 'comp_aux_lib', 'valid_date'];
  var CHAMPS_LET = ['ecriture_let', 'date_let'];

  function valeurs(ligne, champs) { return champs.map(function (c) { return ligne[c]; }); }

  /** Clé K2 : client | exercice | journal | numéro. Seule la portée EXERCICE est admise à cette étape. */
  function cleEcriture(ligne, profil) {
    if (profil && (profil.portee_numerotation || 'EXERCICE') !== 'EXERCICE') throw C.erreurContrat('PROFIL_INVALIDE', 'portee_numerotation');
    return [ligne.client_id, ligne.exercice_id, ligne.journal_code, ligne.ecriture_num].join('|');
  }

  /** @returns {{h_fond: string, h_desc: string, h_let: string}} */
  function empreintes(ligne, hasher) {
    return {
      h_fond: E.H('h_fond', valeurs(ligne, CHAMPS_FOND), hasher),
      h_desc: E.H('h_desc', valeurs(ligne, CHAMPS_DESC), hasher),
      h_let: E.H('h_let', valeurs(ligne, CHAMPS_LET), hasher)
    };
  }

  /** hLigne = H("ligne", valeurs de CHAMPS_ACTIF) — ligne active complète. */
  function hLigne(ligne, hasher) {
    return E.H('ligne', valeurs(ligne, C.CHAMPS_ACTIF), hasher);
  }

  /** h_ecr = H("ecriture", [cle, date, liste triée des h_fond+h_desc+h_let]) — lignes munies de leurs empreintes. */
  function hEcriture(lignes, hasher) {
    if (!lignes.length) return '';
    var items = lignes.map(function (l) { return l.h_fond + l.h_desc + l.h_let; }).sort(E.comparerTexte);
    return E.H('ecriture', [lignes[0].cle_ecriture, lignes[0].ecriture_date].concat(items), hasher);
  }

  /** Ordre canonique des lignes d'une écriture : compte, auxiliaire, montant signé, rang source. */
  function comparerLignes(a, b) {
    if (a.compte_num !== b.compte_num) return a.compte_num < b.compte_num ? -1 : 1;
    if (a.comp_aux_num !== b.comp_aux_num) return a.comp_aux_num < b.comp_aux_num ? -1 : 1;
    if (a.montant_cts !== b.montant_cts) return a.montant_cts - b.montant_cts;
    return a.source_rang - b.source_rang;
  }

  /** ligne_uid = cle_ecriture + "#" + k (k = 1..n dans l'ordre canonique). Renvoie des copies. */
  function attribuerLigneUid(lignes) {
    return lignes.slice().sort(comparerLignes).map(function (l, i) {
      var c = {};
      Object.keys(l).forEach(function (k) { c[k] = l[k]; });
      c.ligne_uid = l.cle_ecriture + '#' + (i + 1);
      return c;
    });
  }

  return {
    CHAMPS_FOND: CHAMPS_FOND,
    CHAMPS_DESC: CHAMPS_DESC,
    CHAMPS_LET: CHAMPS_LET,
    cleEcriture: cleEcriture,
    empreintes: empreintes,
    hLigne: hLigne,
    hEcriture: hEcriture,
    attribuerLigneUid: attribuerLigneUid
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Identite;

// ===== 08_lecture.js =====
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

// ===== 09_comparaison.js =====
/**
 * Classification des écritures du fichier par rapport à l'actif, dans le périmètre déclaré (contrat §4.6).
 * Unité de comparaison : l'écriture entière (A8), par multiensembles triés d'empreintes.
 */
var Comparaison = (function (C, E, Identite) {
  'use strict';

  var S = C.STATUTS;

  /** Vrai si un import publié et non annulé du client porte ce file_sha256. */
  function detecterReimport(fileSha256, imports) {
    return (imports || []).some(function (i) { return i.file_sha256 === fileSha256 && i.statut === 'PUBLIE'; });
  }

  /**
   * @param {{base: object[], lignes: object[], perimetre: object, profil: object, client_id: string, hasher: object}} e
   * @returns {{ecritures: object[], lignesRetenues: object[], lignesIgnorees: object[], compteurs: object}}
   */
  function classer(e) {
    var hasher = e.hasher;
    var p = e.perimetre;
    (e.base || []).concat(e.lignes).forEach(function (l) {
      if (l.client_id !== e.client_id) throw C.erreurContrat('CLIENT_INCOHERENT', 'client_id');
    });
    e.lignes.forEach(function (l) { if (l.exercice_id !== p.exercice_id) throw C.erreurContrat('PERIMETRE_INVALIDE', 'exercice_id'); });

    var fichier = regrouperFichier(e.lignes, hasher);
    var base = regrouperBase(e.base, p.exercice_id, hasher);
    var contigu = e.profil.contiguite_ecritures !== false;
    var ecritures = [];
    var retenues = [];
    var ignorees = [];
    var parStatut = {};
    Object.keys(S).forEach(function (k) { parStatut[k] = 0; });
    var parSousType = { M_FOND: 0, M_DATE: 0, M_DESC: 0, M_LET: 0 };

    Object.keys(fichier).sort(E.comparerTexte).forEach(function (cle) {
      var blocs = fichier[cle];
      var toutes = [].concat.apply([], blocs);
      var ec = enTete(cle, toutes[0]);
      var dates = distinctes(toutes.map(function (l) { return l.ecriture_date; }));
      var precedente = base[cle] || [];

      var retenu = toutes;
      var motif = dates.length > 1 ? 'DATES_MULTIPLES' : '';
      if (!motif && contigu && blocs.length > 1) {
        var sig0 = signature(blocs[0]);
        if (blocs.every(function (b) { return signature(b) === sig0; })) {
          retenu = blocs[0];
          for (var k = 1; k < blocs.length; k++) {
            ignorees.push.apply(ignorees, blocs[k].map(function (l) { return marquer(l, false, S.DOUBLON_INTRA); }));
            ecritures.push(blocIgnore(cle, blocs[k], k + 1));
            parStatut.DOUBLON_INTRA++;
          }
        } else {
          motif = 'BLOCS_DIFFERENTS';
        }
      }
      if (motif) {
        ec.statut = S.COLLISION;
        ec.motif = motif;
        ec.lignes = toutes.map(function (l) { return marquer(l, true, S.COLLISION); });
        ec.rangs = toutes.map(function (l) { return l.source_rang; });
        // Lignes en collision : en staging (comptées comme importées), import bloqué par IDN_COLLISION.
        retenues.push.apply(retenues, ec.lignes);
        parStatut.COLLISION++;
        ecritures.push(ec);
        return;
      }

      var actives = precedente.filter(function (l) { return l.statut === 'ACTIVE'; });
      ec.version_base = precedente.reduce(function (v, l) { return Math.max(v, l.version || 0); }, 0);
      ec.ligne_uids_base = precedente.map(function (l) { return l.ligne_uid; }).sort(E.comparerTexte);
      ec.validee_fichier = retenu.some(function (l) { return l.valid_date !== ''; });
      if (!actives.length) {
        ec.statut = S.NOUVELLE;
        ec.reactivation = precedente.length > 0;
      } else {
        ec.lignes_base = actives;
        ec.ecriture_date_base = actives[0].ecriture_date;
        ec.validee_base = actives.some(function (l) { return l.valid_date !== ''; });
        ec.h_ecr_base = Identite.hEcriture(actives, hasher);
        ec.sous_types = sousTypes(actives, retenu);
        ec.statut = ec.sous_types.length ? S.MODIFIEE : S.INCHANGEE;
        ec.sous_types.forEach(function (s) { parSousType[s]++; });
      }
      ec.lignes = Identite.attribuerLigneUid(retenu).map(function (l) { return marquer(l, true, ec.statut); });
      ec.rangs = retenu.map(function (l) { return l.source_rang; });
      ec.h_ecr = Identite.hEcriture(ec.lignes, hasher);
      retenues.push.apply(retenues, ec.lignes);
      parStatut[ec.statut]++;
      ecritures.push(ec);
    });

    var enPerimetre = 0;
    Object.keys(base).sort(E.comparerTexte).forEach(function (cle) {
      var actives = base[cle].filter(function (l) { return l.statut === 'ACTIVE'; });
      if (!actives.length || !dansPerimetre(actives[0], p)) return;
      enPerimetre++;
      if (fichier[cle]) return;
      var ec = enTete(cle, actives[0]);
      ec.statut = S.ABSENTE;
      ec.bloc = 0;
      ec.lignes_base = actives;
      ec.ecriture_date_base = actives[0].ecriture_date;
      ec.version_base = actives.reduce(function (v, l) { return Math.max(v, l.version || 0); }, 0);
      ec.ligne_uids_base = actives.map(function (l) { return l.ligne_uid; }).sort(E.comparerTexte);
      ec.validee_base = actives.some(function (l) { return l.valid_date !== ''; });
      ec.h_ecr_base = Identite.hEcriture(actives, hasher);
      ec.aide = ec.validee_base ? '' : 'PROBABLEMENT_VALIDEE_SOUS_NOUVEAU_NUMERO';
      parStatut.ABSENTE++;
      ecritures.push(ec);
    });

    ecritures.sort(function (a, b) { return a.cle !== b.cle ? E.comparerTexte(a.cle, b.cle) : a.bloc - b.bloc; });
    return {
      ecritures: ecritures,
      lignesRetenues: retenues,
      lignesIgnorees: ignorees,
      compteurs: {
        par_statut: parStatut,
        par_sous_type: parSousType,
        ecritures_fichier: Object.keys(fichier).length,
        lignes_retenues: retenues.length,
        lignes_doublons_ignorees: ignorees.length,
        ecritures_base_perimetre: enPerimetre
      }
    };
  }

  function enTete(cle, l) {
    return {
      cle: cle, exercice_id: l.exercice_id, journal_code: l.journal_code, ecriture_num: l.ecriture_num,
      statut: '', sous_types: [], bloc: 1, rangs: [], ligne_uids_base: [],
      ecriture_date: l.ecriture_date, ecriture_date_base: '', version_base: 0,
      validee_base: false, validee_fichier: false, reactivation: false, h_ecr: '', h_ecr_base: '', aide: '', motif: '',
      lignes: [], lignes_base: []
    };
  }

  function blocIgnore(cle, lignes, numero) {
    var ec = enTete(cle, lignes[0]);
    ec.statut = S.DOUBLON_INTRA;
    ec.bloc = numero;
    ec.rangs = lignes.map(function (l) { return l.source_rang; });
    return ec;
  }

  function marquer(l, retenue, statut) {
    var c = {};
    Object.keys(l).forEach(function (k) { c[k] = l[k]; });
    c.retenue = retenue;
    c.statut_staging = statut;
    if (c.ligne_uid === undefined) c.ligne_uid = '';
    return c;
  }

  /** Regroupe les lignes du fichier par clé, en blocs de lignes consécutives (ordre des rangs). */
  function regrouperFichier(lignes, hasher) {
    var parCle = {};
    var precedente = null;
    lignes.slice().sort(function (a, b) { return a.source_rang - b.source_rang; }).forEach(function (l) {
      var c = completer(l, hasher);
      var blocs = parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = []);
      if (precedente !== l.cle_ecriture || !blocs.length) blocs.push([]);
      blocs[blocs.length - 1].push(c);
      precedente = l.cle_ecriture;
    });
    return parCle;
  }

  function regrouperBase(actif, exerciceId, hasher) {
    var parCle = {};
    (actif || []).forEach(function (l) {
      if (l.exercice_id !== exerciceId) return;
      (parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = [])).push(completer(l, hasher));
    });
    return parCle;
  }

  /** Recalcule les empreintes depuis les champs : on ne fait jamais confiance aux empreintes stockées. */
  function completer(l, hasher) {
    var c = {};
    Object.keys(l).forEach(function (k) { c[k] = l[k]; });
    var h = Identite.empreintes(l, hasher);
    c.h_fond = h.h_fond; c.h_desc = h.h_desc; c.h_let = h.h_let;
    return c;
  }

  function dansPerimetre(l, p) {
    return l.exercice_id === p.exercice_id && l.ecriture_date >= p.du && l.ecriture_date <= p.au;
  }

  function multi(lignes, f) { return lignes.map(f).sort(E.comparerTexte).join('\n'); }
  function tf(l) { return l.h_fond; }
  function tfd(l) { return l.h_fond + '|' + l.h_desc; }
  function tfdl(l) { return l.h_fond + '|' + l.h_desc + '|' + l.h_let; }
  function signature(lignes) { return lignes[0].ecriture_date + '\n' + multi(lignes, tfdl); }

  function sousTypes(base, fichier) {
    var types = [];
    var memeDate = base[0].ecriture_date === fichier[0].ecriture_date;
    if (memeDate && multi(base, tfdl) === multi(fichier, tfdl)) return types;
    var fondDiffere = multi(base, tf) !== multi(fichier, tf);
    if (fondDiffere) types.push('M_FOND');
    if (!memeDate) types.push('M_DATE');
    if (!fondDiffere) {
      if (multi(base, tfd) !== multi(fichier, tfd)) types.push('M_DESC');
      else if (multi(base, tfdl) !== multi(fichier, tfdl)) types.push('M_LET');
    }
    return types;
  }

  function distinctes(valeurs) {
    var vues = {};
    return valeurs.filter(function (v) { if (vues[v]) return false; vues[v] = true; return true; });
  }

  return {
    detecterReimport: detecterReimport,
    classer: classer,
    dansPerimetre: dansPerimetre
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte'),
  typeof Identite !== 'undefined' ? Identite : require('./identite')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Comparaison;

// ===== 10_publication.js =====
/**
 * Version et checksum de l'actif, simulation, empreinte de staging, plan de publication et d'annulation
 * (contrat §4.8, §4.9, §5.3, §5.4, §7). L'actif n'est jamais modifié sur place.
 *
 * Mouvements : au plus un par (publication_id, ligne_uid), avec l'image complète de la ligne avant
 * changement ; c'est elle qui permet le retour arrière par reconstruction (D8).
 */
var Publication = (function (C, E, Identite, Anomalies) {
  'use strict';

  function copier(o) {
    var c = {};
    Object.keys(o).forEach(function (k) { c[k] = o[k]; });
    return c;
  }
  function parUid(a, b) { return E.comparerTexte(a.ligne_uid, b.ligne_uid); }

  // ------------------------------------------------------------------ version, checksum, statistiques

  /** Identifiant de la dernière publication appliquée (PUBLICATION ou ANNULATION) ; "" si aucune. */
  function versionActif(publications) {
    var p = publications || [];
    return p.length ? p[p.length - 1].publication_id : '';
  }

  /** checksumActif = H("actif", [n].concat(hLigne des lignes triées par ligne_uid)). Actif vide : H("actif", ["0"]). */
  function checksumActif(actif, hasher) {
    var lignes = (actif || []).slice().sort(parUid);
    return E.H('actif', [String(lignes.length)].concat(lignes.map(function (l) { return Identite.hLigne(l, hasher); })), hasher);
  }

  function statsActif(actif) {
    var s = { nb_lignes: 0, nb_actives: 0, debit_cts: 0, credit_cts: 0 };
    (actif || []).forEach(function (l) {
      s.nb_lignes++;
      if (l.statut === 'ACTIVE') { s.nb_actives++; s.debit_cts += l.debit_cts; s.credit_cts += l.credit_cts; }
    });
    return s;
  }

  // ------------------------------------------------------------------ construction de l'actif suivant

  function versActive(l, version, premierImport, publicationId, hasher) {
    var a = {};
    C.CHAMPS_ACTIF.forEach(function (k) { a[k] = l[k] === undefined ? '' : l[k]; });
    a.montant_devise_cts = l.montant_devise_cts === undefined ? null : l.montant_devise_cts;
    a.version = version;
    a.statut = 'ACTIVE';
    a.first_import_id = premierImport || l.source_import_id;
    a.last_publication_id = publicationId;
    var h = Identite.empreintes(a, hasher);
    a.h_fond = h.h_fond; a.h_desc = h.h_desc; a.h_let = h.h_let;
    return a;
  }

  /** Décisions ABSENTE indexées par clé (ACCEPTER | REPORTER). */
  function choixAbsentes(decisions) {
    var choix = {};
    (decisions || []).forEach(function (d) { if (d.type === 'ABSENTE') choix[d.cle] = d.choix; });
    return choix;
  }

  /**
   * Construit l'actif suivant et les mouvements, sans vérification.
   * @param {{base: object[], comparaison: object, choix: Object<string, string>, publication_id: string,
   *          type_pub?: string, import_id: string, hasher: object}} e
   */
  function construire(e) {
    var parCle = {};
    (e.base || []).forEach(function (l) { (parCle[l.cle_ecriture] || (parCle[l.cle_ecriture] = [])).push(l); });
    var bruts = [];

    e.comparaison.ecritures.forEach(function (ec) {
      var avant = parCle[ec.cle] || [];
      var versionAvant = avant.reduce(function (v, l) { return Math.max(v, l.version); }, 0);
      var apres = null;
      var nature = null;
      if (ec.statut === 'NOUVELLE' || ec.statut === 'MODIFIEE') {
        var premier = avant.length ? avant[0].first_import_id : '';
        apres = ec.lignes.map(function (l) { return versActive(l, versionAvant + 1, premier, e.publication_id, e.hasher); });
        nature = ec.statut === 'MODIFIEE' && ec.sous_types.length === 1 && ec.sous_types[0] === 'M_LET' ? 'LETTRAGE' : 'MODIFICATION';
      } else if (ec.statut === 'ABSENTE' && e.choix[ec.cle] === 'ACCEPTER') {
        apres = avant.map(function (l) {
          var s = copier(l);
          s.statut = 'SUPPRIMEE_SOURCE';
          s.version = versionAvant + 1;
          s.last_publication_id = e.publication_id;
          return s;
        });
        nature = 'SUPPRESSION_LOGIQUE';
      } else if (ec.statut === 'COLLISION') {
        throw C.erreurContrat('ARGUMENT_MANQUANT', 'collision');
      }
      if (!apres) return;
      var sousTypes = ec.sous_types.slice();
      if (ec.reactivation) sousTypes.push('REACTIVATION'); // P4 : réapparition tracée dans le mouvement
      var avantParUid = {};
      avant.forEach(function (l) { avantParUid[l.ligne_uid] = l; });
      var apresParUid = {};
      apres.forEach(function (l) { apresParUid[l.ligne_uid] = l; });
      var uids = Object.keys(avantParUid).concat(Object.keys(apresParUid).filter(function (u) { return !avantParUid[u]; }));
      uids.forEach(function (uid) {
        var a = avantParUid[uid], b = apresParUid[uid];
        var type = a && b ? nature : (b ? 'INSERTION' : 'RETRAIT_LIGNE');
        bruts.push({
          cle_ecriture: ec.cle, ligne_uid: uid, type: type, sous_types: sousTypes,
          version_avant: a ? a.version : 0, version_apres: b ? b.version : 0,
          h_avant: a ? Identite.hLigne(a, e.hasher) : '', h_apres: b ? Identite.hLigne(b, e.hasher) : '',
          image_avant: a ? copier(a) : null
        });
      });
      parCle[ec.cle] = apres;
    });

    var actif = [];
    Object.keys(parCle).forEach(function (cle) { actif.push.apply(actif, parCle[cle]); });
    actif.sort(parUid);
    bruts.sort(function (x, y) { return x.cle_ecriture !== y.cle_ecriture ? E.comparerTexte(x.cle_ecriture, y.cle_ecriture) : E.comparerTexte(x.ligne_uid, y.ligne_uid); });
    var mouvements = bruts.map(function (m, i) {
      var r = copier(m);
      r.mouvement_id = e.publication_id + ':' + ('00000' + (i + 1)).slice(-6);
      r.publication_id = e.publication_id;
      r.type_pub = e.type_pub || 'PUBLICATION';
      r.import_id = e.import_id || '';
      r.annule_mouvement_id = '';
      return r;
    });
    return { actif: actif, mouvements: mouvements };
  }

  /**
   * Simulation (contrôles REC_MIROIR, variations de soldes).
   * hypothese : 'ABSENTES_ACCEPTEES' | 'ABSENTES_MAINTENUES' | 'DECISIONS'.
   */
  function simulerActif(e) {
    var choix;
    if (e.hypothese === 'DECISIONS') choix = choixAbsentes(e.decisions);
    else {
      choix = {};
      var valeur = e.hypothese === 'ABSENTES_ACCEPTEES' ? 'ACCEPTER' : 'REPORTER';
      e.comparaison.ecritures.forEach(function (ec) { if (ec.statut === 'ABSENTE') choix[ec.cle] = valeur; });
    }
    var sansCollision = { ecritures: e.comparaison.ecritures.filter(function (ec) { return ec.statut !== 'COLLISION'; }) };
    return construire({ base: e.base, comparaison: sansCollision, choix: choix, publication_id: 'SIMULATION', import_id: '', hasher: e.hasher }).actif;
  }

  /** Défait des mouvements : retire les lignes des écritures touchées et restaure les images avant. */
  function defaire(actif, mouvements) {
    var touchees = {};
    mouvements.forEach(function (m) { touchees[m.cle_ecriture] = true; });
    var restaurees = mouvements.filter(function (m) { return m.image_avant; }).map(function (m) { return copier(m.image_avant); });
    return actif.filter(function (l) { return !touchees[l.cle_ecriture]; }).concat(restaurees).sort(parUid);
  }

  // ------------------------------------------------------------------ empreinte de staging (A7)

  /**
   * empreinte_staging = H("staging", [import, client, périmètre, profil, règles, fichier, Lignes, Écritures,
   * Anomalies (statuts après décisions), Décisions, Total saisi]).
   */
  function empreinteStaging(e, hasher) {
    var res = e.resultat;
    var comp = res.comparaison || { ecritures: [], lignesRetenues: [], lignesIgnorees: [] };
    var lignes = comp.lignesRetenues.concat(comp.lignesIgnorees).slice().sort(function (a, b) { return a.source_rang - b.source_rang; })
      .map(function (l) {
        return E.H('ligne_staging', [l.source_rang, l.cle_ecriture, l.ligne_uid, l.retenue, l.statut_staging, l.journal_code,
          l.ecriture_num, l.ecriture_date, l.compte_num_source, l.h_fond, l.h_desc, l.h_let], hasher);
      });
    var ecritures = comp.ecritures.map(function (ec) {
      return E.H('ecriture_classee', [ec.cle, ec.bloc, ec.statut, ec.sous_types.join(','), ec.version_base, ec.reactivation,
        ec.h_ecr, ec.h_ecr_base], hasher);
    });
    var appliquees = Anomalies.appliquerDecisions(res.anomalies, e.decisions).anomalies;
    var anomalies = appliquees.slice().sort(function (a, b) { return E.comparerTexte(a.anomalie_id, b.anomalie_id); }).map(function (a) {
      return E.H('anomalie', [a.anomalie_id, a.code, a.gravite, a.statut, a.empreinte_objet, a.empreinte_derogation], hasher);
    });
    var decisions = (e.decisions || []).slice().sort(function (a, b) { return E.comparerTexte(a.decision_id, b.decision_id); }).map(function (d) {
      var cible = d.type === 'ABSENTE' ? d.cle : d.type === 'DEROGATION' ? d.anomalie_id : d.code + ':' + (d.anomalie_ids || []).join(',');
      return E.H('decision', [d.decision_id, d.type, cible, d.choix || '', d.motif || d.commentaire || '', d.reference || '',
        d.par, d.le, d.origine || '', d.source_decision_id || ''], hasher);
    });
    var ts = res.total_saisi;
    var hTs = ts ? E.H('total_saisi', [ts.debit_cts, ts.credit_cts, ts.debit_cts_confirmation, ts.credit_cts_confirmation,
      ts.nb_lignes === undefined ? null : ts.nb_lignes, ts.source || '', ts.saisi_par || '', ts.saisi_le || ''], hasher) : '';
    var p = res.perimetre;
    return E.H('staging', [res.import_id, res.client_id, p.exercice_id, p.du, p.au, res.profil_ref.profil_id, res.profil_ref.version,
      res.profil_ref.type, res.version_regles, res.file_sha256, E.Coll('staging_lignes', lignes, hasher),
      E.Coll('staging_ecritures', ecritures, hasher), E.Coll('staging_anomalies', anomalies, hasher),
      E.Coll('staging_decisions', decisions, hasher), hTs], hasher);
  }

  // ------------------------------------------------------------------ publication

  /**
   * @param {{base: object[], publications: object[], resultat: object, decisions: object[], validation: object,
   *          autre_import_en_cours?: boolean, publication_id: string, horodatage: string, hasher: object}} e
   * @returns {{ok: true, actif_suivant: object[], mouvements: object[], publication: object} |
   *           {ok: false, refus: string[], details: Object<string, *>}}
   */
  function planifierPublication(e) {
    E.verifierHasher(e.hasher);
    var refus = {};
    function refuser(code, detail) { refus[code] = detail === undefined ? true : detail; }
    var v = e.validation;
    var res = e.resultat;
    if (!v || v.decision !== 'VALIDE' || v.import_id !== res.import_id || v.client_id !== res.client_id
        || !v.valide_le || !v.soumis_le || v.valide_le < v.soumis_le) refuser('PUB_VALIDATION_ABSENTE');
    if (v && C.CHECKLIST.some(function (k) { return !(v.checklist && v.checklist[k] === true); })) refuser('PUB_CHECKLIST');
    if (e.autre_import_en_cours) refuser('PUB_IMPORT_EN_COURS');
    if (!res.comparaison) refuser('PUB_BND_OUVERT', 'import non analysé ou arrêté');

    var appli = Anomalies.appliquerDecisions(res.anomalies, e.decisions);
    var anomalies = appli.anomalies;
    appli.erreurs.forEach(function (x) { refuser(x.code, x.decision_id); });
    var ids = function (liste) { return liste.map(function (a) { return a.anomalie_id; }); };
    var bnd = anomalies.filter(function (a) { return a.gravite === 'BND'; });
    if (bnd.length) refuser('PUB_BND_OUVERT', ids(bnd));
    var bOuvertes = anomalies.filter(function (a) { return a.gravite === 'B' && a.statut !== 'DEROGEE'; });
    if (bOuvertes.length) refuser('PUB_B_NON_DEROGE', ids(bOuvertes));
    var aOuvertes = anomalies.filter(function (a) { return a.gravite === 'A' && a.statut !== 'ACQUITTEE'; });
    if (aOuvertes.length) refuser('PUB_A_NON_ACQUITTE', ids(aOuvertes));
    var choix = choixAbsentes(e.decisions);
    var sansDecision = res.comparaison ? res.comparaison.ecritures.filter(function (ec) {
      return ec.statut === 'ABSENTE' && choix[ec.cle] !== 'ACCEPTER' && choix[ec.cle] !== 'REPORTER';
    }) : [];
    if (sansDecision.length) refuser('PUB_ABSENTE_SANS_DECISION', sansDecision.map(function (ec) { return ec.cle; }));

    // A7 : revalidation des données et de leur version au moment de la publication.
    var checksumAvant = checksumActif(e.base, e.hasher);
    var version = versionActif(e.publications);
    if (v && (checksumAvant !== v.checksum_base || version !== v.version_base)) refuser('PUB_BASE_MODIFIEE');
    if (v && res.comparaison && empreinteStaging({ resultat: res, decisions: e.decisions }, e.hasher) !== v.empreinte_staging) refuser('PUB_STAGING_MODIFIE');

    var codes = Object.keys(refus).sort(E.comparerTexte);
    if (codes.length) return { ok: false, refus: codes, details: refus };

    var plan = construire({ base: e.base, comparaison: res.comparaison, choix: choix, publication_id: e.publication_id,
      import_id: res.import_id, hasher: e.hasher });
    if (!verifierPlan(e.base, plan, checksumAvant, e.hasher)) return { ok: false, refus: ['PUB_REC_PUBLICATION'], details: { PUB_REC_PUBLICATION: true } };

    var stats = statsActif(plan.actif);
    var parType = {};
    plan.mouvements.forEach(function (m) { parType[m.type] = (parType[m.type] || 0) + 1; });
    return {
      ok: true,
      actif_suivant: plan.actif,
      mouvements: plan.mouvements,
      publication: {
        publication_id: e.publication_id, type_pub: 'PUBLICATION', import_id: res.import_id, validation_id: v.validation_id,
        publication_precedente_id: version, annule_publication_id: '',
        checksum_avant: checksumAvant, checksum_apres: checksumActif(plan.actif, e.hasher),
        nb_lignes_avant: (e.base || []).length, nb_lignes_apres: stats.nb_lignes,
        sigma_debit_actives: stats.debit_cts, sigma_credit_actives: stats.credit_cts,
        nb_mouvements_par_type: parType, statut: 'PUBLIEE', annulee_par: '', horodatage: e.horodatage || '',
        derogations_retenues: (e.decisions || []).filter(function (d) { return d.type === 'DEROGATION'; }).map(copier)
      }
    };
  }

  /**
   * REC_PUBLICATION, avant toute bascule :
   * (a) chaque image avant existe dans la base avec la même empreinte ; chaque empreinte après correspond à l'actif suivant ;
   * (b) défaire les mouvements redonne exactement la base (réversibilité) ;
   * (c) Σ débit / crédit des lignes ACTIVE après = avant + Σ après − Σ avant.
   */
  function verifierPlan(base, plan, checksumAvant, hasher) {
    var baseParUid = {}, suivParUid = {};
    (base || []).forEach(function (l) { baseParUid[l.ligne_uid] = l; });
    plan.actif.forEach(function (l) { suivParUid[l.ligne_uid] = l; });
    var avant = statsActif(base), apres = statsActif(plan.actif);
    var d = avant.debit_cts, c = avant.credit_cts;
    for (var i = 0; i < plan.mouvements.length; i++) {
      var m = plan.mouvements[i];
      if (m.image_avant) {
        var b = baseParUid[m.ligne_uid];
        if (!b || Identite.hLigne(b, hasher) !== m.h_avant || Identite.hLigne(m.image_avant, hasher) !== m.h_avant) return false;
        if (b.statut === 'ACTIVE') { d -= b.debit_cts; c -= b.credit_cts; }
      }
      var s = suivParUid[m.ligne_uid];
      if ((s ? Identite.hLigne(s, hasher) : '') !== m.h_apres) return false;
      if (s && s.statut === 'ACTIVE') { d += s.debit_cts; c += s.credit_cts; }
    }
    if (d !== apres.debit_cts || c !== apres.credit_cts) return false;
    return checksumActif(defaire(plan.actif, plan.mouvements), hasher) === checksumAvant;
  }

  // ------------------------------------------------------------------ annulation (D8)

  /**
   * @param {{actif: object[], publications: object[], mouvements: object[], publication_id_annulee: string,
   *          import_en_cours?: boolean, tampon_inactif?: object[], publication_id: string, horodatage: string, hasher: object}} e
   */
  function planifierAnnulation(e) {
    E.verifierHasher(e.hasher);
    var refus = {};
    var pubs = e.publications || [];
    var p = pubs.filter(function (x) { return x.publication_id === e.publication_id_annulee; })[0];
    if (!p) return { ok: false, refus: ['ANN_PAS_DERNIERE'], details: {} };
    if (p.type_pub !== 'PUBLICATION') refus.ANN_TYPE = true;
    if (p.statut === 'ANNULEE') refus.ANN_DEJA_ANNULEE = true;
    if (versionActif(pubs) !== p.publication_id) refus.ANN_PAS_DERNIERE = true;
    if (e.import_en_cours) refus.ANN_IMPORT_EN_COURS = true;
    var courant = checksumActif(e.actif, e.hasher);
    if (courant !== p.checksum_apres) refus.ANN_ACTIF_ALTERE = true;
    var codes = Object.keys(refus).sort(E.comparerTexte);
    if (codes.length) return { ok: false, refus: codes, details: refus };

    var propres = (e.mouvements || []).filter(function (m) { return m.publication_id === p.publication_id; });
    var restaure = defaire(e.actif, propres);
    var stats = statsActif(restaure);
    var checksumRestaure = checksumActif(restaure, e.hasher);
    if (checksumRestaure !== p.checksum_avant || stats.nb_lignes !== p.nb_lignes_avant) return { ok: false, refus: ['ANN_VERIFICATION'], details: {} };
    if (e.tampon_inactif && checksumActif(e.tampon_inactif, e.hasher) !== checksumRestaure) return { ok: false, refus: ['ANN_TAMPON_DIVERGENT'], details: {} };

    var avantParUid = {}, restParUid = {};
    e.actif.forEach(function (l) { avantParUid[l.ligne_uid] = l; });
    restaure.forEach(function (l) { restParUid[l.ligne_uid] = l; });
    var mouvements = propres.slice().sort(function (x, y) { return E.comparerTexte(x.mouvement_id, y.mouvement_id); }).map(function (m, i) {
      var a = avantParUid[m.ligne_uid], b = restParUid[m.ligne_uid];
      return {
        mouvement_id: e.publication_id + ':' + ('00000' + (i + 1)).slice(-6), publication_id: e.publication_id,
        type_pub: 'ANNULATION', import_id: p.import_id, ligne_uid: m.ligne_uid, cle_ecriture: m.cle_ecriture,
        type: 'ANNULATION', sous_types: [], version_avant: a ? a.version : 0, version_apres: b ? b.version : 0,
        h_avant: a ? Identite.hLigne(a, e.hasher) : '', h_apres: b ? Identite.hLigne(b, e.hasher) : '',
        image_avant: a ? copier(a) : null, annule_mouvement_id: m.mouvement_id
      };
    });
    var annulee = copier(p);
    annulee.statut = 'ANNULEE';
    annulee.annulee_par = e.publication_id;
    return {
      ok: true,
      actif_restaure: restaure,
      mouvements_inverses: mouvements,
      publication_annulee: annulee,
      publication_annulation: {
        publication_id: e.publication_id, type_pub: 'ANNULATION', import_id: p.import_id, validation_id: '',
        publication_precedente_id: p.publication_id, annule_publication_id: p.publication_id,
        checksum_avant: courant, checksum_apres: checksumRestaure,
        nb_lignes_avant: e.actif.length, nb_lignes_apres: stats.nb_lignes,
        sigma_debit_actives: stats.debit_cts, sigma_credit_actives: stats.credit_cts,
        nb_mouvements_par_type: { ANNULATION: mouvements.length }, statut: 'PUBLIEE', annulee_par: '',
        horodatage: e.horodatage || '', derogations_retenues: []
      }
    };
  }

  return {
    versionActif: versionActif,
    checksumActif: checksumActif,
    statsActif: statsActif,
    simulerActif: simulerActif,
    defaire: defaire,
    empreinteStaging: empreinteStaging,
    planifierPublication: planifierPublication,
    planifierAnnulation: planifierAnnulation
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte'),
  typeof Identite !== 'undefined' ? Identite : require('./identite'),
  typeof Anomalies !== 'undefined' ? Anomalies : require('./anomalies')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Publication;

// ===== 11_controles.js =====
/**
 * Contrôles essentiels du MVP (§17, contrat §6) : produisent des anomalies et des résultats de contrôle,
 * ne modifient rien. Les contrôles indépendants (A6) n'utilisent ni parseMontant ni parseDate.
 */
var Controles = (function (C, E, Anomalies, Comparaison) {
  'use strict';

  var A = Anomalies.creer;

  /**
   * Contrôles préalables, avant toute lecture du contenu et avant la détection de réimport.
   *
   * P6 — identité de la société : un FEC n'est jamais rejeté sur le seul nom du fichier.
   * Sources examinées : dossier de dépôt (adaptateur), SIREN déclaré par l'opérateur, SIREN du nom FEC.
   * - une source fiable qui désigne un autre client → CLI_MISMATCH (BND) ;
   * - aucune confirmation par le dossier ou la déclaration → CLI_IDENTITE_NON_CONFIRMEE (B, motivée) ;
   * - FEC dont le nom ne suit pas SIRENFECAAAAMMJJ → CLI_NOM_FEC_NON_CONFORME (A).
   * A4 — un exercice déjà alimenté par une autre source → PRF_CHANGEMENT (BND) ; type dérivé de l'actif.
   *
   * @param {{client: object, profil: object, nomFichier: string, perimetre: object, actif: object[],
   *          identite?: {dossier_client_id?: string, siren_declare?: string}}} c
   */
  function controlesPrealables(c) {
    var anomalies = [];
    var id = c.identite || {};
    var contradictions = [];
    var confirmations = 0;
    if (id.dossier_client_id) {
      if (id.dossier_client_id !== c.client.client_id) contradictions.push('DOSSIER');
      else confirmations++;
    }
    if (id.siren_declare) {
      if (id.siren_declare !== c.client.siren) contradictions.push('SIREN_DECLARE');
      else confirmations++;
    }
    var m = /^(\d{9})FEC(\d{8})/i.exec(c.nomFichier || '');
    if (m && m[1] !== c.client.siren) contradictions.push('SIREN_NOM_FICHIER');
    if (contradictions.length) {
      anomalies.push(A('CLI_MISMATCH', { objet_cle: contradictions.join(','), attendu: c.client.siren, obtenu: m ? m[1] : '',
        message: 'source(s) désignant un autre client : ' + contradictions.join(', ') }));
    } else if (!confirmations) {
      anomalies.push(A('CLI_IDENTITE_NON_CONFIRMEE', { message: 'ni le dossier de dépôt ni une déclaration ne confirment le client' }));
    }
    if (c.profil.type === 'FEC' && !m) {
      anomalies.push(A('CLI_NOM_FEC_NON_CONFORME', { message: 'nom de fichier FEC non conforme (SIRENFECAAAAMMJJ)' }));
    }
    var types = {};
    (c.actif || []).forEach(function (l) { if (l.exercice_id === c.perimetre.exercice_id) types[l.source_type] = true; });
    var autres = Object.keys(types).filter(function (t) { return t !== c.profil.type; });
    if (autres.length) {
      anomalies.push(A('PRF_CHANGEMENT', { objet_type: 'EXERCICE', objet_cle: c.perimetre.exercice_id, attendu: autres.join(','),
        obtenu: c.profil.type, message: 'mélange de sources interdit : passer par une migration contrôlée (A4)' }));
    }
    return anomalies;
  }

  /**
   * @param {{client: object, profil: object, perimetre: object, lecture: object, comparaison: object|null,
   *          base: object[], actif_simule: object[]|null, total_saisi?: object}} ctx
   * @returns {{controles: object[], anomalies: object[], variations: object[]}}
   */
  function executerControles(ctx) {
    var controles = [];
    var anomalies = [];
    var lecture = ctx.lecture;
    function controle(id, attendu, obtenu, ok) {
      controles.push({ control_id: id, control_version: C.VERSION_REGLES, attendu: String(attendu), obtenu: String(obtenu),
        ecart: ok ? '' : 'ECART', ok: ok });
      return ok;
    }

    // --- Structure : encodage, en-tête, rejets (A2 : une seule anomalie REJ_LIGNES, détaillée par motif)
    var vus = {};
    lecture.anomaliesStructure.forEach(function (s) {
      var cle = s.code + '|' + s.motif + '|' + s.colonne;
      if (vus[cle]) return;
      vus[cle] = true;
      anomalies.push(A(s.code, { objet_cle: s.motif + (s.colonne ? '|' + s.colonne : ''), message: s.colonne }));
    });
    if (lecture.structure_ok && lecture.rejets.length) {
      var parMotif = {};
      lecture.rejets.forEach(function (r) {
        var t = parMotif[r.motif] || (parMotif[r.motif] = []);
        if (t.indexOf(r.rang) === -1) t.push(r.rang);
      });
      var motifs = Object.keys(parMotif).sort(E.comparerTexte);
      anomalies.push(A('REJ_LIGNES', { nb: lecture.lignesRejetees.length, rangs: lecture.lignesRejetees, obtenu: lecture.lignesRejetees.length,
        message: motifs.map(function (k) { return k + ' : ' + parMotif[k].join(','); }).join(' ; ') }));
    }
    if (!lecture.structure_ok || !ctx.comparaison) return { controles: controles, anomalies: trier(anomalies), variations: [] };

    var comp = ctx.comparaison;
    var cpt = lecture.compteurs;
    var exercice = ctx.client.exercices.filter(function (x) { return x.id === ctx.perimetre.exercice_id; })[0];
    var cloture = exercice.statut === 'CLOTURE';

    // --- C4 / REC_LIGNES : lignes physiques recomptées indépendamment, aucune ligne perdue
    var okLignes = controle('REC_LIGNES', 'lues = retenues + rejetées + vides + doublons ignorés',
      JSON.stringify({ physiques: cpt.lignes_physiques, couvertes: cpt.lignes_couvertes, lues: cpt.lues, retenues: comp.compteurs.lignes_retenues,
        rejetees: cpt.rejetees, vides: cpt.vides, doublons: comp.compteurs.lignes_doublons_ignorees }),
      cpt.lignes_physiques === cpt.lignes_couvertes && cpt.lues === cpt.normalisees + cpt.rejetees + cpt.vides
        && cpt.normalisees === comp.compteurs.lignes_retenues + comp.compteurs.lignes_doublons_ignorees);
    if (!okLignes) anomalies.push(A('REC_LIGNES', { obtenu: controles[controles.length - 1].obtenu }));

    // --- C5 / REC_TOTAUX : totaux recalculés sur les chaînes brutes par un parseur minimal distinct
    var bruts = totauxBruts(lecture.montants_bruts, ctx.profil);
    var recalc = somme(lecture.lignes);
    var okTotaux = controle('REC_TOTAUX', JSON.stringify(bruts), JSON.stringify(lecture.totaux),
      bruts.debit_cts === lecture.totaux.debit_cts && bruts.credit_cts === lecture.totaux.credit_cts
        && recalc.debit_cts === lecture.totaux.debit_cts && recalc.credit_cts === lecture.totaux.credit_cts);
    if (!okTotaux) anomalies.push(A('REC_TOTAUX', { attendu: JSON.stringify(bruts), obtenu: JSON.stringify(lecture.totaux) }));

    // --- C7 / REC_MIROIR : actif simulé (ABSENTES acceptées) restreint au périmètre = lignes retenues du fichier
    if (ctx.actif_simule) {
      var miroir = verifierMiroir(ctx.actif_simule, comp, ctx.perimetre);
      if (!controle('REC_MIROIR', miroir.attendu, miroir.obtenu, miroir.ok)) {
        anomalies.push(A('REC_MIROIR', { attendu: miroir.attendu, obtenu: miroir.obtenu, cles: miroir.comptes }));
      }
    }

    // --- C6 / équilibre
    var total = lecture.totaux;
    var okGlobal = controle('EQU_GLOBAL', total.debit_cts, total.credit_cts, total.debit_cts === total.credit_cts);
    if (!okGlobal) {
      anomalies.push(A('EQU_GLOBAL', { gravite: ctx.profil.type === 'GL' ? 'B' : 'BND', attendu: total.debit_cts,
        obtenu: total.credit_cts, ecart: total.debit_cts - total.credit_cts }));
    }
    comp.ecritures.forEach(function (ec) {
      if (ec.statut === 'COLLISION' || ec.statut === 'DOUBLON_INTRA' || ec.statut === 'ABSENTE') return;
      var s = somme(ec.lignes);
      if (s.debit_cts !== s.credit_cts) {
        anomalies.push(A('EQU_ECRITURE', { objet_type: 'ECRITURE', objet_cle: ec.cle, attendu: s.debit_cts, obtenu: s.credit_cts,
          ecart: s.debit_cts - s.credit_cts }));
      }
    });

    // --- A6 / P2 : total logiciel obligatoire pour un grand livre (C1 double saisie, C2 écart, C3 absence).
    // Non rapproché s'il existe des lignes rejetées (REJ_LIGNES bloque déjà ; l'écart serait mécanique).
    var ts = ctx.total_saisi;
    if (!lecture.rejets.length) {
      if (ts) {
        var confirme = ts.debit_cts_confirmation === undefined
          || (ts.debit_cts_confirmation === ts.debit_cts && ts.credit_cts_confirmation === ts.credit_cts);
        if (!controle('REC_TOTAL_SAISI_CONFIRMATION', 'double saisie identique', confirme ? 'identique' : 'différente', confirme)) {
          anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'SAISIE_NON_CONFIRMEE' }));
        }
        var attenduTs = JSON.stringify({ debit_cts: ts.debit_cts, credit_cts: ts.credit_cts });
        if (!controle('REC_TOTAL_SAISI', attenduTs, JSON.stringify(total), ts.debit_cts === total.debit_cts && ts.credit_cts === total.credit_cts)) {
          anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'ECART', attendu: attenduTs, obtenu: JSON.stringify(total),
            ecart: (total.debit_cts - ts.debit_cts) + '/' + (total.credit_cts - ts.credit_cts) }));
        }
        if (typeof ts.nb_lignes === 'number' && !controle('REC_TOTAL_SAISI_LIGNES', ts.nb_lignes, cpt.normalisees, ts.nb_lignes === cpt.normalisees)) {
          anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'NB_LIGNES', attendu: ts.nb_lignes, obtenu: cpt.normalisees }));
        }
      } else if (ctx.profil.type === 'GL') {
        controle('REC_TOTAL_SAISI', 'total saisi', 'absent', false);
        anomalies.push(A('REC_TOTAL_SAISI', { objet_cle: 'TOTAL_ABSENT', message: 'total du logiciel obligatoire pour un grand livre (P2)' }));
      }
    }

    // --- Périmètre et comptes
    if (lecture.horsPerimetre.length) {
      anomalies.push(A('PER_HORS_PERIMETRE', { nb: lecture.horsPerimetre.length, rangs: lecture.horsPerimetre,
        attendu: ctx.perimetre.du + '/' + ctx.perimetre.au }));
    }
    var sourcesBase = {};
    (ctx.base || []).forEach(function (l) {
      if (l.statut !== 'ACTIVE') return;
      var compact = String(l.compte_num_source || '').replace(/[ .\-]/g, '').toUpperCase();
      var t = sourcesBase[l.compte_num] || (sourcesBase[l.compte_num] = []);
      if (compact && t.indexOf(compact) === -1) t.push(compact);
    });
    Object.keys(lecture.comptesSources).sort(E.comparerTexte).forEach(function (compte) {
      var sources = lecture.comptesSources[compte].slice();
      (sourcesBase[compte] || []).forEach(function (s) { if (sources.indexOf(s) === -1) sources.push(s); });
      if (sources.length > 1) {
        anomalies.push(A('CPT_COLLISION_PADDING', { objet_type: 'COMPTE', objet_cle: compte, obtenu: sources.sort(E.comparerTexte).join(',') }));
      }
      if (!/^[1-8]/.test(compte)) anomalies.push(A('CPT_CLASSE', { objet_type: 'COMPTE', objet_cle: compte }));
    });

    // --- Identification
    var absentes = 0;
    var parCleDoublons = {};
    comp.ecritures.forEach(function (ec) { if (ec.statut === 'DOUBLON_INTRA') parCleDoublons[ec.cle] = (parCleDoublons[ec.cle] || 0) + 1; });
    var modDesc = [], modLet = [], reapp = [];
    comp.ecritures.forEach(function (ec) {
      var o = { objet_type: 'ECRITURE', objet_cle: ec.cle };
      if (ec.statut === 'COLLISION') anomalies.push(A('IDN_COLLISION', ext(o, { message: ec.motif, rangs: ec.rangs })));
      if (ec.statut === 'ABSENTE') {
        absentes++;
        // P5 : sur exercice clôturé, une seule anomalie B, levée par une décision ABSENTE motivée (validation renforcée).
        anomalies.push(A('IDN_ABSENTE', ext(o, { gravite: cloture ? 'B' : 'A', mention: cloture ? 'EXERCICE_CLOTURE' : '', message: ec.aide })));
        return;
      }
      if (ec.statut === 'DOUBLON_INTRA') return;
      if (parCleDoublons[ec.cle] && ec.bloc === 1) anomalies.push(A('IDN_DOUBLON_INTRA', ext(o, { nb: parCleDoublons[ec.cle] })));
      if (ec.statut === 'MODIFIEE') {
        if (ec.sous_types.indexOf('M_FOND') !== -1 || ec.sous_types.indexOf('M_DATE') !== -1) {
          anomalies.push(A('IDN_MOD_FOND', ext(o, { mention: ec.validee_base ? 'VALIDEE' : '', obtenu: ec.sous_types.join(',') })));
        } else if (ec.sous_types.indexOf('M_DESC') !== -1) modDesc.push(ec.cle);
        else if (ec.sous_types.indexOf('M_LET') !== -1) modLet.push(ec.cle);
        if (ec.validee_base && !ec.validee_fichier) anomalies.push(A('IDN_DEVALIDEE', o));
      }
      if (ec.statut === 'NOUVELLE' && ec.reactivation) reapp.push(ec.cle);
      var surCloture = ec.statut === 'NOUVELLE' || (ec.statut === 'MODIFIEE' && !(ec.sous_types.length === 1 && ec.sous_types[0] === 'M_LET'));
      if (cloture && surCloture) anomalies.push(A('PER_CLOTURE', ext(o, { obtenu: ec.statut })));
    });
    var seuils = ctx.client.seuils || {};
    var pct = seuils.suppr_masse_pct === undefined ? 5 : seuils.suppr_masse_pct;
    var nbMax = seuils.suppr_masse_nb === undefined ? 50 : seuils.suppr_masse_nb;
    var base = comp.compteurs.ecritures_base_perimetre;
    var massif = absentes > 0 && (absentes * 100 > pct * base || absentes > nbMax);
    controle('VOL_SUPPR_MASSE', '<= ' + pct + ' % et <= ' + nbMax, absentes + '/' + base, !massif);
    if (massif) anomalies.push(A('VOL_SUPPR_MASSE', { attendu: '<= ' + pct + ' % et <= ' + nbMax, obtenu: absentes + '/' + base, nb: absentes }));

    // --- Informations (agrégées)
    if (modDesc.length) anomalies.push(A('IDN_MOD_DESC', { nb: modDesc.length, cles: modDesc }));
    if (modLet.length) anomalies.push(A('IDN_MOD_LET', { nb: modLet.length, cles: modLet }));
    if (reapp.length) anomalies.push(A('IDN_REAPPARITION', { nb: reapp.length, cles: reapp }));
    var infos = lecture.infos;
    if (infos.montants_nuls.length) anomalies.push(A('MNT_NUL', { nb: infos.montants_nuls.length, rangs: infos.montants_nuls }));
    if (infos.montants_negatifs.length) anomalies.push(A('MNT_NEG', { nb: infos.montants_negatifs.length, rangs: infos.montants_negatifs }));
    if (infos.decimales_nulles.length) anomalies.push(A('MNT_DECIMALES_NULLES', { nb: infos.decimales_nulles.length, rangs: infos.decimales_nulles }));
    if (infos.a_neutraliser.length) anomalies.push(A('SEC_NEUTRALISE', { nb: infos.a_neutraliser.length, rangs: infos.a_neutraliser }));

    return {
      controles: controles,
      anomalies: trier(anomalies),
      variations: ctx.actif_simule ? variationsSoldes(ctx.base, ctx.actif_simule) : []
    };
  }

  function trier(anomalies) {
    return anomalies.slice().sort(function (a, b) { return E.comparerTexte(a.anomalie_id, b.anomalie_id); });
  }

  function ext(base, plus) {
    var o = {};
    Object.keys(base).forEach(function (k) { o[k] = base[k]; });
    Object.keys(plus).forEach(function (k) { o[k] = plus[k]; });
    return o;
  }

  /**
   * Totaux recalculés depuis les chaînes brutes, sans Normalisation.parseMontant (contrôle indépendant A6).
   * Règle minimale : chiffres et séparateur décimal conservés ; négatif si « - » ou « ( » ; deux décimales.
   * P3 : chaque montant reste dans sa colonne, signe compris.
   */
  function totauxBruts(montantsBruts, profil) {
    var dec = profil.decimal;
    function cts(s) {
      s = String(s || '');
      var negatif = s.indexOf('-') !== -1 || s.indexOf('(') !== -1;
      var garde = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if ((ch >= '0' && ch <= '9') || ch === dec) garde += ch;
      }
      var pos = garde.lastIndexOf(dec);
      var ent = pos === -1 ? garde : garde.slice(0, pos);
      var fra = pos === -1 ? '' : garde.slice(pos + 1);
      var v = Number(ent || '0') * 100 + Number((fra + '00').slice(0, 2));
      return negatif ? -v : v;
    }
    var debit = 0, credit = 0;
    (montantsBruts || []).forEach(function (m) {
      if (profil.mode_sens === 'DEBIT_CREDIT') { debit += cts(m.debit); credit += cts(m.credit); return; }
      var sens = String(m.sens || '').trim().toUpperCase();
      var estD = profil.valeurs_sens.D.some(function (v) { return String(v).toUpperCase() === sens; });
      if (estD) debit += cts(m.montant); else credit += cts(m.montant);
    });
    return { debit_cts: debit, credit_cts: credit };
  }

  function somme(lignes) {
    var d = 0, c = 0;
    lignes.forEach(function (l) { d += l.debit_cts; c += l.credit_cts; });
    return { debit_cts: d, credit_cts: c };
  }

  function soldesParCompte(lignes) {
    var s = {};
    lignes.forEach(function (l) { s[l.compte_num] = (s[l.compte_num] || 0) + l.debit_cts - l.credit_cts; });
    return s;
  }

  function verifierMiroir(actifSimule, comp, perimetre) {
    var actives = actifSimule.filter(function (l) { return l.statut === 'ACTIVE' && Comparaison.dansPerimetre(l, perimetre); });
    var fichier = comp.lignesRetenues.filter(function (l) { return Comparaison.dansPerimetre(l, perimetre); });
    var sa = somme(actives), sf = somme(fichier);
    var ca = soldesParCompte(actives), cf = soldesParCompte(fichier);
    var comptes = Object.keys(ca).concat(Object.keys(cf)).filter(function (v, i, t) { return t.indexOf(v) === i; });
    var ecarts = comptes.filter(function (k) { return (ca[k] || 0) !== (cf[k] || 0); }).sort(E.comparerTexte);
    return {
      ok: actives.length === fichier.length && sa.debit_cts === sf.debit_cts && sa.credit_cts === sf.credit_cts && !ecarts.length,
      attendu: JSON.stringify({ lignes: fichier.length, debit: sf.debit_cts, credit: sf.credit_cts }),
      obtenu: JSON.stringify({ lignes: actives.length, debit: sa.debit_cts, credit: sa.credit_cts }),
      comptes: ecarts
    };
  }

  /**
   * Variations de solde par compte sur l'exercice : [{compte, avant_cts, apres_cts, delta_cts}],
   * deltas non nuls, triés par |delta| décroissant puis par compte.
   */
  function variationsSoldes(base, actifSimule) {
    var avant = soldesParCompte((base || []).filter(function (l) { return l.statut === 'ACTIVE'; }));
    var apres = soldesParCompte((actifSimule || []).filter(function (l) { return l.statut === 'ACTIVE'; }));
    var comptes = Object.keys(avant).concat(Object.keys(apres)).filter(function (v, i, t) { return t.indexOf(v) === i; });
    return comptes.map(function (k) {
      return { compte: k, avant_cts: avant[k] || 0, apres_cts: apres[k] || 0, delta_cts: (apres[k] || 0) - (avant[k] || 0) };
    }).filter(function (v) { return v.delta_cts !== 0; }).sort(function (a, b) {
      var d = Math.abs(b.delta_cts) - Math.abs(a.delta_cts);
      return d !== 0 ? d : E.comparerTexte(a.compte, b.compte);
    });
  }

  return {
    controlesPrealables: controlesPrealables,
    executerControles: executerControles,
    totauxBruts: totauxBruts,
    soldesParCompte: soldesParCompte,
    variationsSoldes: variationsSoldes
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte'),
  typeof Anomalies !== 'undefined' ? Anomalies : require('./anomalies'),
  typeof Comparaison !== 'undefined' ? Comparaison : require('./comparaison')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Controles;

// ===== 12_pipeline.js =====
/**
 * Cas d'usage en mémoire : analyser un import, valider, publier, annuler la dernière publication.
 *
 * L'état d'un client est une valeur immuable : chaque opération renvoie un nouvel état.
 * À l'intégration Apps Script, cet état sera porté par les onglets (CONFIG, IMPORTS, JOURNAL,
 * ACTIF_A/B, MOUVEMENTS) via des adaptateurs ; les règles restent ici.
 */
var Pipeline = (function (C, E, Lecture, Comparaison, Controles, Publication, Anomalies) {
  'use strict';

  /** @returns {{client_id: string, actif: object[], mouvements: object[], publications: object[], imports: object[]}} */
  function etatInitial(clientId) {
    return { client_id: clientId, actif: [], mouvements: [], publications: [], imports: [] };
  }

  /**
   * @param {{etat: object, fichier: {texte: string, nomFichier: string, sha256: string}, profil: object, client: object,
   *          perimetre: object, identite?: object, totalSaisi?: object, import_id: string, horodatage?: string, hasher: object}} e
   */
  function analyserImport(e) {
    E.verifierHasher(e.hasher);
    var etat = e.etat;
    if (!etat || etat.client_id !== e.client.client_id) throw C.erreurContrat('CLIENT_INCOHERENT', 'etat');
    var exercice = e.client.exercices.filter(function (x) { return x.id === e.perimetre.exercice_id; })[0];
    var r = {
      import_id: e.import_id,
      client_id: e.client.client_id,
      file_sha256: e.fichier.sha256,
      nom_fichier: e.fichier.nomFichier,
      perimetre: e.perimetre,
      profil_ref: { profil_id: e.profil.profil_id, version: e.profil.version, type: e.profil.type },
      version_regles: C.VERSION_REGLES,
      statut: 'ANALYSE',
      rejete: false,
      lecture: null,
      comparaison: null,
      anomalies: [],
      controles: [],
      variations: [],
      total_saisi: e.totalSaisi || null,
      decisions_reconduites: []
    };
    var anomalies = [];

    // Intégrité de l'actif : son checksum doit être celui de la dernière publication appliquée.
    var derniere = etat.publications[etat.publications.length - 1];
    var checksumAttendu = derniere ? derniere.checksum_apres : Publication.checksumActif([], e.hasher);
    var checksumCourant = Publication.checksumActif(etat.actif, e.hasher);
    if (checksumCourant !== checksumAttendu) anomalies.push(Anomalies.creer('SYS_ACTIF_ALTERE', { objet_type: 'ACTIF', attendu: checksumAttendu, obtenu: checksumCourant }));

    // Contrôles préalables AVANT la détection de réimport (un fichier d'un autre client est refusé comme tel).
    anomalies = anomalies.concat(Controles.controlesPrealables({
      client: e.client, profil: e.profil, nomFichier: e.fichier.nomFichier, perimetre: e.perimetre, actif: etat.actif, identite: e.identite
    }));
    if (anomalies.some(function (a) { return a.gravite === 'BND'; })) {
      r.statut = 'REJETE';
      return finaliser(r, anomalies, etat, e, exercice);
    }
    if (Comparaison.detecterReimport(e.fichier.sha256, etat.imports)) {
      r.statut = 'REIMPORT_FICHIER';
      return finaliser(r, anomalies, etat, e, exercice);
    }

    r.lecture = Lecture.normaliserFichier({
      texte: e.fichier.texte, nomFichier: e.fichier.nomFichier, profil: e.profil, client: e.client, perimetre: e.perimetre,
      import_id: e.import_id, file_sha256: e.fichier.sha256
    });
    var simule = null;
    var collisions = false;
    if (r.lecture.structure_ok) {
      r.comparaison = Comparaison.classer({
        base: etat.actif, lignes: r.lecture.lignes, perimetre: e.perimetre, profil: e.profil, client_id: e.client.client_id, hasher: e.hasher
      });
      collisions = r.comparaison.ecritures.some(function (ec) { return ec.statut === 'COLLISION'; });
      simule = Publication.simulerActif({ base: etat.actif, comparaison: r.comparaison, hypothese: 'ABSENTES_ACCEPTEES', hasher: e.hasher });
      r.variations = Controles.variationsSoldes(etat.actif, simule);
    }
    var resultatControles = Controles.executerControles({
      client: e.client, profil: e.profil, perimetre: e.perimetre, lecture: r.lecture, comparaison: r.comparaison,
      // REC_MIROIR sans objet en cas de collision : l'import est déjà bloqué par IDN_COLLISION.
      base: etat.actif, actif_simule: collisions ? null : simule, total_saisi: e.totalSaisi
    });
    r.controles = resultatControles.controles;
    anomalies = anomalies.concat(resultatControles.anomalies);
    if (anomalies.some(function (a) { return a.gravite === 'BND'; })) r.statut = 'REJETE';
    return finaliser(r, anomalies, etat, e, exercice);
  }

  /** Empreintes d'objet et de dérogation (A5, P1) ; dérogations reconductibles depuis la dernière publication. */
  function finaliser(r, anomalies, etat, e, exercice) {
    var parCle = {};
    var parCompte = {};
    if (r.comparaison) {
      r.comparaison.ecritures.forEach(function (ec) {
        if (ec.bloc !== 1 && ec.statut !== 'ABSENTE') return;
        parCle[ec.cle] = ec;
        ec.lignes.forEach(function (l) {
          var t = parCompte[l.compte_num] || (parCompte[l.compte_num] = []);
          if (ec.h_ecr && t.indexOf(ec.h_ecr) === -1) t.push(ec.h_ecr);
        });
      });
    }
    var ctx = { perimetre: e.perimetre, statut_exercice: exercice ? exercice.statut : '', profil_id: e.profil.profil_id, profil_version: e.profil.version };
    r.anomalies = anomalies.map(function (a) {
      var h = [];
      if (a.objet_type === 'ECRITURE' && parCle[a.objet_cle]) h = [parCle[a.objet_cle].h_ecr_base, parCle[a.objet_cle].h_ecr];
      else if (a.objet_type === 'COMPTE') h = parCompte[a.objet_cle] || [];
      else h = a.cles.map(function (k) { return parCle[k] ? parCle[k].h_ecr || parCle[k].h_ecr_base : ''; });
      var c = {};
      Object.keys(a).forEach(function (k) { c[k] = a[k]; });
      c.empreinte_objet = Anomalies.empreinteObjet(c, h, e.hasher);
      c.empreinte_derogation = Anomalies.empreinteDerogation(c, ctx, e.hasher);
      return c;
    }).sort(function (a, b) { return E.comparerTexte(a.anomalie_id, b.anomalie_id); });
    r.rejete = r.anomalies.some(function (a) { return a.gravite === 'BND'; });
    var derniere = etat.publications[etat.publications.length - 1];
    var precedentes = derniere && derniere.type_pub === 'PUBLICATION' && derniere.statut === 'PUBLIEE' ? derniere.derogations_retenues || [] : [];
    r.decisions_reconduites = Anomalies.reconduireDerogations({
      anomalies: r.anomalies, derogations_precedentes: precedentes, import_id: r.import_id, horodatage: e.horodatage || ''
    });
    return r;
  }

  /**
   * Fige la validation (A7). Les dérogations reconduites (A5) sont ajoutées d'office, sauf si une dérogation
   * manuelle porte sur la même anomalie ; elles entrent dans l'empreinte du staging, donc dans la validation.
   * @param {{decisions?: object[], checklist?: object, validation_id: string, soumis_par: string, soumis_le: string,
   *          valide_par: string, valide_le: string}} choix
   * @returns {{validation: object, decisions: object[]}}
   */
  function valider(etat, analyse, choix, hasher) {
    E.verifierHasher(hasher);
    var manuelles = (choix.decisions || []).slice();
    var derogees = {};
    manuelles.forEach(function (d) { if (d.type === 'DEROGATION') derogees[d.anomalie_id] = true; });
    var decisions = analyse.decisions_reconduites.filter(function (d) { return !derogees[d.anomalie_id]; }).concat(manuelles);
    return {
      decisions: decisions,
      validation: {
        validation_id: choix.validation_id,
        import_id: analyse.import_id,
        client_id: analyse.client_id,
        decision: 'VALIDE',
        empreinte_staging: Publication.empreinteStaging({ resultat: analyse, decisions: decisions }, hasher),
        checksum_base: Publication.checksumActif(etat.actif, hasher),
        version_base: Publication.versionActif(etat.publications),
        checklist: choix.checklist || {},
        soumis_par: choix.soumis_par || '', soumis_le: choix.soumis_le || '',
        valide_par: choix.valide_par || '', valide_le: choix.valide_le || ''
      }
    };
  }

  /**
   * @param {{validation: object, decisions: object[]}} validee résultat de valider()
   * @param {{publication_id: string, horodatage?: string, autre_import_en_cours?: boolean}} options
   * @returns {{ok: true, etat: object, publication: object} | {ok: false, refus: string[], details: object}}
   */
  function publier(etat, analyse, validee, options, hasher) {
    if (analyse.statut === 'REIMPORT_FICHIER') return { ok: false, refus: ['PUB_REIMPORT'], details: {} };
    var plan = Publication.planifierPublication({
      base: etat.actif, publications: etat.publications, resultat: analyse, decisions: validee ? validee.decisions : [],
      validation: validee ? validee.validation : null, autre_import_en_cours: !!options.autre_import_en_cours,
      publication_id: options.publication_id, horodatage: options.horodatage, hasher: hasher
    });
    if (!plan.ok) return plan;
    return {
      ok: true,
      publication: plan.publication,
      etat: {
        client_id: etat.client_id,
        actif: plan.actif_suivant,
        mouvements: etat.mouvements.concat(plan.mouvements),
        publications: etat.publications.concat([plan.publication]),
        imports: etat.imports.concat([{ import_id: analyse.import_id, file_sha256: analyse.file_sha256, statut: 'PUBLIE',
          publication_id: options.publication_id }])
      }
    };
  }

  /**
   * Annule la dernière publication (un seul niveau ; pas d'annulation d'une annulation).
   * @param {{publication_id: string, horodatage?: string, import_en_cours?: boolean, tampon_inactif?: object[]}} options
   */
  function annulerDernierePublication(etat, options, hasher) {
    var derniere = etat.publications[etat.publications.length - 1];
    if (!derniere) return { ok: false, refus: ['ANN_PAS_DERNIERE'], details: {} };
    var plan = Publication.planifierAnnulation({
      actif: etat.actif, publications: etat.publications, mouvements: etat.mouvements, publication_id_annulee: derniere.publication_id,
      import_en_cours: !!options.import_en_cours, tampon_inactif: options.tampon_inactif,
      publication_id: options.publication_id, horodatage: options.horodatage, hasher: hasher
    });
    if (!plan.ok) return plan;
    return {
      ok: true,
      publication: plan.publication_annulation,
      etat: {
        client_id: etat.client_id,
        actif: plan.actif_restaure,
        mouvements: etat.mouvements.concat(plan.mouvements_inverses),
        publications: etat.publications.map(function (p) { return p.publication_id === derniere.publication_id ? plan.publication_annulee : p; })
          .concat([plan.publication_annulation]),
        imports: etat.imports.map(function (i) {
          if (i.publication_id !== derniere.publication_id) return i;
          var c = {};
          Object.keys(i).forEach(function (k) { c[k] = i[k]; });
          c.statut = 'ANNULE';
          return c;
        })
      }
    };
  }

  return {
    etatInitial: etatInitial,
    analyserImport: analyserImport,
    valider: valider,
    publier: publier,
    annulerDernierePublication: annulerDernierePublication
  };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('../core/constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('../core/empreinte'),
  typeof Lecture !== 'undefined' ? Lecture : require('../core/lecture'),
  typeof Comparaison !== 'undefined' ? Comparaison : require('../core/comparaison'),
  typeof Controles !== 'undefined' ? Controles : require('../core/controles'),
  typeof Publication !== 'undefined' ? Publication : require('../core/publication'),
  typeof Anomalies !== 'undefined' ? Anomalies : require('../core/anomalies')
);

if (typeof module !== 'undefined' && module.exports) module.exports = Pipeline;

// ===== 15_JeuxFictifs.js =====
/** Jeux FICTIFS S01 et S03 — généré par scripts/construire-gas.js, ne pas modifier. */
var JeuxFictifs = {
 "client": {
  "client_id": "CLI-TEST",
  "siren": "123456789",
  "longueur_compte": 8,
  "exercices": [
   {
    "id": "2025",
    "debut": "2025-01-01",
    "fin": "2025-12-31",
    "statut": "CLOTURE"
   },
   {
    "id": "2026",
    "debut": "2026-01-01",
    "fin": "2026-12-31",
    "statut": "OUVERT"
   }
  ],
  "seuils": {
   "suppr_masse_pct": 5,
   "suppr_masse_nb": 50
  }
 },
 "profil": {
  "profil_id": "FEC_GENERIQUE",
  "version": 1,
  "type": "FEC",
  "encodage": "UTF-8",
  "separateur": "\t",
  "decimal": ",",
  "format_date": "AAAAMMJJ",
  "mode_sens": "DEBIT_CREDIT",
  "colonnes": {
   "JournalCode": "journal_code",
   "JournalLib": "journal_lib",
   "EcritureNum": "ecriture_num",
   "EcritureDate": "ecriture_date",
   "CompteNum": "compte_num",
   "CompteLib": "compte_lib",
   "CompAuxNum": "comp_aux_num",
   "CompAuxLib": "comp_aux_lib",
   "PieceRef": "piece_ref",
   "PieceDate": "piece_date",
   "EcritureLib": "ecriture_lib",
   "Debit": "debit",
   "Credit": "credit",
   "EcritureLet": "ecriture_let",
   "DateLet": "date_let",
   "ValidDate": "valid_date",
   "Montantdevise": "montant_devise",
   "Idevise": "idevise"
  },
  "colonnes_ignorees": [],
  "valeurs_sens": {
   "D": [
    "D"
   ],
   "C": [
    "C"
   ]
  },
  "lettrage_vide": [
   "",
   "0"
  ],
  "portee_numerotation": "EXERCICE",
  "contiguite_ecritures": true
 },
 "s01": {
  "texte": "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise\nVT\tVentes\t000120\t20260108\t411\tClients\t0012\tDupont Fictif SARL\tF2026-001\t20260108\t=1+1 Facture Dupont Fictif\t600,00\t0,00\tAA\t20260131\t20260108\t\t\nVT\tVentes\t000120\t20260108\t706000\tPrestations de services\t\t\tF2026-001\t20260108\t=1+1 Facture Dupont Fictif\t0,00\t500,00\t\t\t20260108\t\t\nVT\tVentes\t000120\t20260108\t44571\tTVA collect\u00e9e\t\t\tF2026-001\t20260108\t=1+1 Facture Dupont Fictif\t0,00\t100,00\t\t\t20260108\t\t\nVT\tVentes\t000121\t20260112\t411\tClients\t0045\t\u00c9lan Conseil Fictif\tF2026-002\t20260112\tPrestation de conseil \u2014 \u00e9t\u00e9\t2400,00\t0,00\t\t\t20260112\t\t\nVT\tVentes\t000121\t20260112\t706000\tPrestations de services\t\t\tF2026-002\t20260112\tPrestation de conseil \u2014 \u00e9t\u00e9\t0,00\t2000,00\t\t\t20260112\t\t\nVT\tVentes\t000121\t20260112\t44571\tTVA collect\u00e9e\t\t\tF2026-002\t20260112\tPrestation de conseil \u2014 \u00e9t\u00e9\t0,00\t400,00\t\t\t20260112\t\t\nVT\tVentes\t000122\t20260114\t411\tClients\t0045\t\u00c9lan Conseil Fictif\tF2026-003\t20260114\t+Facture compl\u00e9mentaire janvier\t1800,00\t0,00\t\t\t20260114\t\t\nVT\tVentes\t000122\t20260114\t706000\tPrestations de services\t\t\tF2026-003\t20260114\t+Facture compl\u00e9mentaire janvier\t0,00\t1500,00\t\t\t20260114\t\t\nVT\tVentes\t000122\t20260114\t44571\tTVA collect\u00e9e\t\t\tF2026-003\t20260114\t+Facture compl\u00e9mentaire janvier\t0,00\t300,00\t\t\t20260114\t\t\nVT\tVentes\t000123\t20260115\t411\tClients\t0012\tDupont Fictif SARL\tF2026-004\t20260115\tFacture Dupont janvier\t1200,00\t0,00\t\t\t20260115\t\t\nVT\tVentes\t000123\t20260115\t706000\tPrestations de services\t\t\tF2026-004\t20260115\tFacture Dupont janvier\t0,00\t1000,00\t\t\t20260115\t\t\nVT\tVentes\t000123\t20260115\t44571\tTVA collect\u00e9e\t\t\tF2026-004\t20260115\tFacture Dupont janvier\t0,00\t200,00\t\t\t20260115\t\t\nAC\tAchats\t000044\t20260120\t606100\tFournitures non stockables\t\t\tFA-7781\t20260120\t@Achat fournitures bureau\t250,00\t0,00\t\t\t20260120\t\t\nAC\tAchats\t000044\t20260120\t44566\tTVA d\u00e9ductible sur ABS\t\t\tFA-7781\t20260120\t@Achat fournitures bureau\t50,00\t0,00\t\t\t20260120\t\t\nAC\tAchats\t000044\t20260120\t401\tFournisseurs\t0078\tBureau Fictif SAS\tFA-7781\t20260120\t@Achat fournitures bureau\t0,00\t300,00\t\t\t20260120\t\t\nBQ\tBanque\t000208\t20260131\t512\tBanque\t\t\tRB-0131\t20260131\tR\u00e8glement Dupont F2026-001\t600,00\t0,00\t\t\t20260131\t\t\nBQ\tBanque\t000208\t20260131\t411\tClients\t0012\tDupont Fictif SARL\tRB-0131\t20260131\tR\u00e8glement Dupont F2026-001\t0,00\t600,00\tAA\t20260131\t20260131\t\t\nAC\tAchats\t000045\t20260210\t607\tAchats de marchandises\t\t\tFA-9045\t20260210\tAchat marchandises f\u00e9vrier\t500,00\t0,00\t\t\t20260210\t\t\nAC\tAchats\t000045\t20260210\t44566\tTVA d\u00e9ductible sur ABS\t\t\tFA-9045\t20260210\tAchat marchandises f\u00e9vrier\t100,00\t0,00\t\t\t20260210\t\t\nAC\tAchats\t000045\t20260210\t401\tFournisseurs\t0091\tGrossiste Fictif\tFA-9045\t20260210\tAchat marchandises f\u00e9vrier\t0,00\t600,00\t\t\t20260210\t\t\nBQ\tBanque\t000209\t20260215\t401\tFournisseurs\t0078\tBureau Fictif SAS\tRB-0215\t20260215\tR\u00e8glement Bureau Fictif\t300,00\t0,00\t\t\t20260215\t\t\nBQ\tBanque\t000209\t20260215\t512\tBanque\t\t\tRB-0215\t20260215\tR\u00e8glement Bureau Fictif\t0,00\t300,00\t\t\t20260215\t\t\nBQ\tBanque\t000210\t20260220\t512\tBanque\t\t\tRB-0220\t20260220\tR\u00e8glement facture Dupont\t1200,00\t0,00\t\t\t20260220\t\t\nBQ\tBanque\t000210\t20260220\t411\tClients\t0012\tDupont Fictif SARL\tRB-0220\t20260220\tR\u00e8glement facture Dupont\t0,00\t1200,00\t\t\t20260220\t\t\nOD\tOp\u00e9rations diverses\t000012\t20260228\t6226\tHonoraires\t\t\tOD-0228\t20260228\tHonoraires \u00e0 recevoir f\u00e9vrier\t300,00\t0,00\t\t\t20260228\t\t\nOD\tOp\u00e9rations diverses\t000012\t20260228\t4081\tFournisseurs - factures non parvenues\t\t\tOD-0228\t20260228\tHonoraires \u00e0 recevoir f\u00e9vrier\t0,00\t300,00\t\t\t20260228\t\t\nAC\tAchats\tPROV-17\t20260305\t606100\tFournitures non stockables\t\t\tFA-1717\t20260305\tAchat petit mat\u00e9riel\t300,00\t0,00\t\t\t\t\t\nAC\tAchats\tPROV-17\t20260305\t401\tFournisseurs\t0078\tBureau Fictif SAS\tFA-1717\t20260305\tAchat petit mat\u00e9riel\t0,00\t300,00\t\t\t\t\t\nBQ\tBanque\t000211\t20260305\t627800\tFrais bancaires\t\t\tRB-0305\t20260305\tFrais bancaires mars\t25,00\t0,00\t\t\t20260305\t\t\nBQ\tBanque\t000211\t20260305\t512\tBanque\t\t\tRB-0305\t20260305\tFrais bancaires mars\t0,00\t25,00\t\t\t20260305\t\t\nBQ\tBanque\t000212\t20260310\t512\tBanque\t\t\tRB-0310\t20260310\tVirement \u00c9lan Conseil\t2400,00\t0,00\t\t\t20260310\t\t\nBQ\tBanque\t000212\t20260310\t411\tClients\t0045\t\u00c9lan Conseil Fictif\tRB-0310\t20260310\tVirement \u00c9lan Conseil\t0,00\t2400,00\t\t\t20260310\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t641000\tR\u00e9mun\u00e9rations du personnel\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t3000,00\t0,00\t\t\t20260331\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t645000\tCharges de s\u00e9curit\u00e9 sociale\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t1200,00\t0,00\t\t\t20260331\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t421\tPersonnel - r\u00e9mun\u00e9rations dues\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t0,00\t3000,00\t\t\t20260331\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t431\tS\u00e9curit\u00e9 sociale\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t0,00\t1200,00\t\t\t20260331\t\t\n",
  "nom_fichier": "123456789FEC20260331.txt",
  "sha256": "3df1fc66ff50ce4e4cf19a6b314223bc2cf9c8a517949802df1a70a30931c8b9",
  "perimetre": {
   "exercice_id": "2026",
   "du": "2026-01-01",
   "au": "2026-03-31"
  }
 },
 "s03": {
  "texte": "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise\nVT\tVentes\t000120\t20260108\t411\tClients\t0012\tDupont Fictif SARL\tF2026-001\t20260108\t=1+1 Facture Dupont Fictif\t600,00\t0,00\tAA\t20260131\t20260108\t\t\nVT\tVentes\t000120\t20260108\t706000\tPrestations de services\t\t\tF2026-001\t20260108\t=1+1 Facture Dupont Fictif\t0,00\t500,00\t\t\t20260108\t\t\nVT\tVentes\t000120\t20260108\t44571\tTVA collect\u00e9e\t\t\tF2026-001\t20260108\t=1+1 Facture Dupont Fictif\t0,00\t100,00\t\t\t20260108\t\t\nVT\tVentes\t000121\t20260112\t411\tClients\t0045\t\u00c9lan Conseil Fictif\tF2026-002\t20260112\tPrestation de conseil \u2014 \u00e9t\u00e9 2026\t2400,00\t0,00\t\t\t20260112\t\t\nVT\tVentes\t000121\t20260112\t706000\tPrestations de services\t\t\tF2026-002\t20260112\tPrestation de conseil \u2014 \u00e9t\u00e9 2026\t0,00\t2000,00\t\t\t20260112\t\t\nVT\tVentes\t000121\t20260112\t44571\tTVA collect\u00e9e\t\t\tF2026-002\t20260112\tPrestation de conseil \u2014 \u00e9t\u00e9 2026\t0,00\t400,00\t\t\t20260112\t\t\nVT\tVentes\t000122\t20260114\t411\tClients\t0045\t\u00c9lan Conseil Fictif\tF2026-003\t20260114\t+Facture compl\u00e9mentaire janvier\t1800,00\t0,00\tAE\t20260412\t20260114\t\t\nVT\tVentes\t000122\t20260114\t706000\tPrestations de services\t\t\tF2026-003\t20260114\t+Facture compl\u00e9mentaire janvier\t0,00\t1500,00\t\t\t20260114\t\t\nVT\tVentes\t000122\t20260114\t44571\tTVA collect\u00e9e\t\t\tF2026-003\t20260114\t+Facture compl\u00e9mentaire janvier\t0,00\t300,00\t\t\t20260114\t\t\nVT\tVentes\t000123\t20260115\t411\tClients\t0012\tDupont Fictif SARL\tF2026-004\t20260115\tFacture Dupont janvier\t1200,00\t0,00\tAB\t20260220\t20260115\t\t\nVT\tVentes\t000123\t20260115\t706000\tPrestations de services\t\t\tF2026-004\t20260115\tFacture Dupont janvier\t0,00\t1000,00\t\t\t20260115\t\t\nVT\tVentes\t000123\t20260115\t44571\tTVA collect\u00e9e\t\t\tF2026-004\t20260115\tFacture Dupont janvier\t0,00\t200,00\t\t\t20260115\t\t\nAC\tAchats\t000044\t20260120\t606100\tFournitures non stockables\t\t\tFA-7781\t20260120\t@Achat fournitures bureau\t250,00\t0,00\t\t\t20260120\t\t\nAC\tAchats\t000044\t20260120\t44566\tTVA d\u00e9ductible sur ABS\t\t\tFA-7781\t20260120\t@Achat fournitures bureau\t50,00\t0,00\t\t\t20260120\t\t\nAC\tAchats\t000044\t20260120\t401\tFournisseurs\t0078\tBureau Fictif SAS\tFA-7781\t20260120\t@Achat fournitures bureau\t0,00\t300,00\tAC\t20260215\t20260120\t\t\nBQ\tBanque\t000208\t20260131\t512\tBanque\t\t\tRB-0131\t20260131\tR\u00e8glement Dupont F2026-001\t600,00\t0,00\t\t\t20260131\t\t\nBQ\tBanque\t000208\t20260131\t411\tClients\t0012\tDupont Fictif SARL\tRB-0131\t20260131\tR\u00e8glement Dupont F2026-001\t0,00\t600,00\tAA\t20260131\t20260131\t\t\nAC\tAchats\t000045\t20260210\t607\tAchats de marchandises\t\t\tFA-9045\t20260210\tAchat marchandises f\u00e9vrier\t550,00\t0,00\t\t\t20260210\t\t\nAC\tAchats\t000045\t20260210\t44566\tTVA d\u00e9ductible sur ABS\t\t\tFA-9045\t20260210\tAchat marchandises f\u00e9vrier\t110,00\t0,00\t\t\t20260210\t\t\nAC\tAchats\t000045\t20260210\t401\tFournisseurs\t0091\tGrossiste Fictif\tFA-9045\t20260210\tAchat marchandises f\u00e9vrier\t0,00\t660,00\t\t\t20260210\t\t\nBQ\tBanque\t000209\t20260215\t401\tFournisseurs\t0078\tBureau Fictif SAS\tRB-0215\t20260215\tR\u00e8glement Bureau Fictif\t300,00\t0,00\tAC\t20260215\t20260215\t\t\nBQ\tBanque\t000209\t20260215\t512\tBanque\t\t\tRB-0215\t20260215\tR\u00e8glement Bureau Fictif\t0,00\t300,00\t\t\t20260215\t\t\nBQ\tBanque\t000210\t20260220\t512\tBanque\t\t\tRB-0220\t20260220\tR\u00e8glement facture Dupont\t1200,00\t0,00\t\t\t20260220\t\t\nBQ\tBanque\t000210\t20260220\t411\tClients\t0012\tDupont Fictif SARL\tRB-0220\t20260220\tR\u00e8glement facture Dupont\t0,00\t1200,00\tAB\t20260220\t20260220\t\t\nAC\tAchats\t000051\t20260305\t606100\tFournitures non stockables\t\t\tFA-1717\t20260305\tAchat petit mat\u00e9riel\t300,00\t0,00\t\t\t20260310\t\t\nAC\tAchats\t000051\t20260305\t401\tFournisseurs\t0078\tBureau Fictif SAS\tFA-1717\t20260305\tAchat petit mat\u00e9riel\t0,00\t300,00\t\t\t20260310\t\t\nBQ\tBanque\t000301\t20260305\t613200\tLocations immobili\u00e8res\t\t\tLOY-03\t20260305\tLoyer mars\t1500,00\t0,00\t\t\t20260305\t\t\nBQ\tBanque\t000301\t20260305\t512\tBanque\t\t\tLOY-03\t20260305\tLoyer mars\t0,00\t1500,00\t\t\t20260305\t\t\nBQ\tBanque\t000302\t20260305\t613200\tLocations immobili\u00e8res\t\t\tLOY-03\t20260305\tLoyer mars\t1500,00\t0,00\t\t\t20260305\t\t\nBQ\tBanque\t000302\t20260305\t512\tBanque\t\t\tLOY-03\t20260305\tLoyer mars\t0,00\t1500,00\t\t\t20260305\t\t\nBQ\tBanque\t000211\t20260304\t627800\tFrais bancaires\t\t\tRB-0305\t20260305\tFrais bancaires mars\t25,00\t0,00\t\t\t20260305\t\t\nBQ\tBanque\t000211\t20260304\t512\tBanque\t\t\tRB-0305\t20260305\tFrais bancaires mars\t0,00\t25,00\t\t\t20260305\t\t\nBQ\tBanque\t000212\t20260310\t512\tBanque\t\t\tRB-0310\t20260310\tVirement \u00c9lan Conseil\t2400,00\t0,00\t\t\t20260310\t\t\nBQ\tBanque\t000212\t20260310\t411\tClients\t0045\t\u00c9lan Conseil Fictif\tRB-0310\t20260310\tVirement \u00c9lan Conseil\t0,00\t2400,00\t\t\t20260310\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t641000\tR\u00e9mun\u00e9rations du personnel\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t3000,00\t0,00\t\t\t20260331\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t645000\tCharges de s\u00e9curit\u00e9 sociale\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t1200,00\t0,00\t\t\t20260331\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t421\tPersonnel - r\u00e9mun\u00e9rations dues\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t0,00\t3000,00\t\t\t20260331\t\t\nOD\tOp\u00e9rations diverses\t000013\t20260331\t431\tS\u00e9curit\u00e9 sociale\t\t\tPAIE-03\t20260331\t\"=IMPORTRANGE(\"\"x\"\",\"\"y\"\")\"\t0,00\t1200,00\t\t\t20260331\t\t\nVT\tVentes\t000124\t20260410\t411\tClients\t0012\tDupont Fictif SARL\tF2026-005\t20260410\tFacture Dupont avril\t960,00\t0,00\t\t\t20260410\t\t\nVT\tVentes\t000124\t20260410\t706000\tPrestations de services\t\t\tF2026-005\t20260410\tFacture Dupont avril\t0,00\t800,00\t\t\t20260410\t\t\nVT\tVentes\t000124\t20260410\t44571\tTVA collect\u00e9e\t\t\tF2026-005\t20260410\tFacture Dupont avril\t0,00\t160,00\t\t\t20260410\t\t\nBQ\tBanque\t000215\t20260412\t512\tBanque\t\t\tRB-0412\t20260412\tR\u00e8glement \u00c9lan Conseil F2026-003\t1800,00\t0,00\t\t\t20260412\t\t\nBQ\tBanque\t000215\t20260412\t411\tClients\t0045\t\u00c9lan Conseil Fictif\tRB-0412\t20260412\tR\u00e8glement \u00c9lan Conseil F2026-003\t0,00\t1800,00\tAE\t20260412\t20260412\t\t\nVT\tVentes\t000124\t20260410\t411\tClients\t0012\tDupont Fictif SARL\tF2026-005\t20260410\tFacture Dupont avril\t960,00\t0,00\t\t\t20260410\t\t\nVT\tVentes\t000124\t20260410\t706000\tPrestations de services\t\t\tF2026-005\t20260410\tFacture Dupont avril\t0,00\t800,00\t\t\t20260410\t\t\nVT\tVentes\t000124\t20260410\t44571\tTVA collect\u00e9e\t\t\tF2026-005\t20260410\tFacture Dupont avril\t0,00\t160,00\t\t\t20260410\t\t\nAC\tAchats\t000052\t20260415\t606100\tFournitures non stockables\t\t\tFA-9152\t20260415\tAchat fournitures avril\t150,00\t0,00\t\t\t20260415\t\t\nAC\tAchats\t000052\t20260415\t44566\tTVA d\u00e9ductible sur ABS\t\t\tFA-9152\t20260415\tAchat fournitures avril\t30,00\t0,00\t\t\t20260415\t\t\nAC\tAchats\t000052\t20260415\t401\tFournisseurs\t0078\tBureau Fictif SAS\tFA-9152\t20260415\tAchat fournitures avril\t0,00\t180,00\t\t\t20260415\t\t\nOD\tOp\u00e9rations diverses\t000014\t20260430\t641000\tR\u00e9mun\u00e9rations du personnel\t\t\tPAIE-04\t20260430\tSalaires avril\t3000,00\t0,00\t\t\t20260430\t\t\nOD\tOp\u00e9rations diverses\t000014\t20260430\t645000\tCharges de s\u00e9curit\u00e9 sociale\t\t\tPAIE-04\t20260430\tSalaires avril\t1200,00\t0,00\t\t\t20260430\t\t\nOD\tOp\u00e9rations diverses\t000014\t20260430\t421\tPersonnel - r\u00e9mun\u00e9rations dues\t\t\tPAIE-04\t20260430\tSalaires avril\t0,00\t3000,00\t\t\t20260430\t\t\nOD\tOp\u00e9rations diverses\t000014\t20260430\t431\tS\u00e9curit\u00e9 sociale\t\t\tPAIE-04\t20260430\tSalaires avril\t0,00\t1200,00\t\t\t20260430\t\t\n",
  "nom_fichier": "123456789FEC20260430.txt",
  "sha256": "270b8a1430f1624b9fa435e2f22aecf9e5679b82ce20a0a0668c22b5d8861fb3",
  "perimetre": {
   "exercice_id": "2026",
   "du": "2026-01-01",
   "au": "2026-04-30"
  }
 },
 "horodatage": {
  "soumis": "2026-10-09T10:00:00Z",
  "valide": "2026-10-09T11:00:00Z"
 },
 "attendu_node": {
  "s01_statuts": {
   "NOUVELLE": 14,
   "INCHANGEE": 0,
   "MODIFIEE": 0,
   "ABSENTE": 0,
   "COLLISION": 0,
   "DOUBLON_INTRA": 0,
   "REIMPORT_FICHIER": 0
  },
  "s03_statuts": {
   "NOUVELLE": 7,
   "INCHANGEE": 4,
   "MODIFIEE": 8,
   "ABSENTE": 2,
   "COLLISION": 0,
   "DOUBLON_INTRA": 1,
   "REIMPORT_FICHIER": 0
  },
  "s03_anomalies": [
   "IDN_ABSENTE:A",
   "IDN_ABSENTE:A",
   "IDN_DOUBLON_INTRA:A",
   "IDN_MOD_DESC:I",
   "IDN_MOD_FOND:A",
   "IDN_MOD_FOND:A",
   "IDN_MOD_LET:I",
   "SEC_NEUTRALISE:I",
   "VOL_SUPPR_MASSE:B"
  ],
  "checksum_pub1": "v1:489390dd3bdb43d88133b9098c9a867f653a84fc00b6b4c0ffd5bb038aed2488",
  "checksum_pub2": "v1:1da36a8b5857b8b8c35c2b78dbbc24ea82ac15540100838f1569f43197501968",
  "checksum_apres_annulation": "v1:489390dd3bdb43d88133b9098c9a867f653a84fc00b6b4c0ffd5bb038aed2488",
  "nb_lignes_actif_pub2": 54
 },
 "avertissement": "DONNEES FICTIVES UNIQUEMENT"
};
