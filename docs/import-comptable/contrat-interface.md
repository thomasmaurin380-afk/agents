# Contrat d'interface minimal — prototype `import-comptable` (cœur JS, Node 22)

| | |
|---|---|
| Statut | Rédigé par `architecte` ; points ouverts P1–P7 tranchés par le dirigeant ; prototype conforme, sauf écarts justifiés listés au §11 (à valider) ; amendements au §12 |
| Version | 0.2 — 2026-10-09 (0.1 : rédaction initiale ; 0.2 : arbitrages P1–P7, résolution des écarts E1–E18) |
| Références | `cahier-des-charges.md` v0.2, partie B (§13–§18 font foi) ; arbitrages A1–A8 du 2026-10-09 |
| Existant | Aucun code dans le dépôt à cette date. Tout ce document est une spécification |

Conventions : « doit » = exigence testable · **[H]** hypothèse · **[V-EC]** à valider par l'expert-comptable · **[À VÉRIFIER]** comportement de plateforme à confirmer par un test ou un spike.

---

## 1. Objet et périmètre

**Objet.** Figer les types, les signatures, les règles de sérialisation et les invariants du cœur métier. Deux buts : (a) l'ingénieur produit les résultats attendus des jeux de test sans dépendre du code ; (b) le code se porte vers Apps Script V8 sans modification.

**Dans le périmètre (code et tests sous Node 22, `node:test`, aucune dépendance npm)**
- Lecture CSV et normalisation `norm_v1`.
- Identification : clé K2 en portée EXERCICE, `ligne_uid`, empreintes.
- Classification : NOUVELLE, INCHANGEE, MODIFIEE (M_FOND, M_DATE, M_DESC, M_LET), ABSENTE, COLLISION, DOUBLON_INTRA, REIMPORT_FICHIER.
- Contrôles du §17 calculables en mémoire (§6 ci-dessous).
- Décisions, dérogations, empreinte de dérogation et reconduction (A5).
- Plan de publication et d'annulation **en mémoire**, revalidation A7, checksum de l'actif.

**Hors périmètre de cette étape**
- Sheets, Drive, déclencheurs, verrous, interface, API, données réelles, Workspace, compte technique (décision reportée avant les données réelles).
- Machine à états `IMPORTS`, traitement par lots, reprise après panne (couche `app/`, étape suivante ; T13 non couvert ici).
- Persistance des statuts d'anomalie entre imports (passage à RESOLUE).
- Partie « dossier de dépôt » de CLI_MISMATCH ; variante « relecture Sheets » de REC_TOTAUX.
- Migration GL ↔ FEC : spécifiée au §8, **non implémentée**.
- RENUMEROTEE, JUMELLE, DOUBLON_INTER, clés K1/K3/K4, portée JOURNAL_MOIS, scission compte collectif / auxiliaire, lignes parasites.

**Données** : uniquement fictives (`CLI-TEST*`, sociétés inventées). Workspace non requis à cette étape.

---

## 2. Structure des fichiers et règle de dépendance

```
import-comptable/
  package.json                 {"private":true,"scripts":{"test":"node --test"}} — aucune dépendance
  src/core/                    JS pur, compatible Apps Script V8
    ordre.json                 (+) ordre de chargement (vm de test, puis filePushOrder clasp)
    constantes.js              (+) statuts, sous-types, codes, gravités, versions, erreurContrat
    empreinte.js               (+) serialiser, hacher, hacherCollection (§5)
    normalisation.js           verifierEncodage, normTexte, neutraliser, parseMontant, parseDate, normCompte
    csv.js                     parseCsv
    profil.js                  validerProfil, validerClient, validerPerimetre, mapperEntete
    anomalies.js               creerAnomalie, empreinteObjet, empreinteDerogation, appliquerDecisions, reconduireDerogations
    identite.js                cleEcriture, empreintes, hLigne, hEcriture, attribuerLigneUid
    lecture.js                 normaliserFichier
    comparaison.js             detecterReimport, classer
    publication.js             versionActif, checksumActif, simulerActif, empreinteStaging, planifierPublication, planifierAnnulation
    controles.js               executerControles, soldesParCompte, variationsSoldes, recompterLignesPhysiques, totauxBruts
  src/adapters/node/
    hasher.js                  sha256Hex via node:crypto (UTF-8)
    fichiers.js                lireOctets, sha256Octets, decoder(octets, encodage) via TextDecoder
  test/
    architecture.test.js       test statique de dépendance (ci-dessous)
    *.test.js
    fixtures/Txx/              entree.csv, client.json, profil.json, perimetre.json, base.json (facultatif), attendu.json
```

`ordre.json` = `["constantes","empreinte","normalisation","csv","profil","anomalies","identite","lecture","comparaison","publication","controles"]`.

### 2.1 Corrections apportées à la structure proposée (justification)

| Correction | Raison |
|---|---|
| `constantes.js` | Une seule source pour les codes, gravités et versions. `version_regles` entre dans l'empreinte de dérogation : la dupliquer créerait des divergences silencieuses |
| `empreinte.js` | Quatre familles d'empreintes (ligne, écriture, staging, dérogation) et le checksum utilisent les mêmes règles : une seule implémentation |
| `ordre.json` | Apps Script charge les fichiers dans un espace global unique ; l'ordre doit être explicite et testé |
| `executerControles` rend `{controles, anomalies, variations}` | A6 exige des résultats attendu / obtenu visibles au niveau de l'import, pas seulement des anomalies ; la restitution des variations de soldes est obligatoire avant validation |
| `normaliserFichier` reçoit `import_id`, `file_sha256` | Traçabilité ligne → fichier source (`source_import_id`, `source_rang`) |
| Contrôles indépendants dans `controles.js`, sans `parseMontant` / `parseDate` | Indépendance réelle des contrôles A6 |

### 2.2 Gabarit de module (obligatoire)

```js
var Lecture = (function (C, E, N, Csv, P, A, I) {
  'use strict';
  /* ... */
  return { normaliserFichier: normaliserFichier };
})(
  typeof Constantes !== 'undefined' ? Constantes : require('./constantes'),
  typeof Empreinte !== 'undefined' ? Empreinte : require('./empreinte')
  /* , ... dans l'ordre de ordre.json */
);
if (typeof module !== 'undefined') module.exports = Lecture;
```

Noms globaux : `Constantes`, `Empreinte`, `Normalisation`, `Csv`, `Profil`, `Anomalies`, `Identite`, `Lecture`, `Comparaison`, `Publication`, `Controles`.

### 2.3 Règles

| # | Règle |
|---|---|
| R1 | `src/core/` : aucune API Node (`require` non relatif, `process`, `Buffer`, `fs`, `crypto`, `TextDecoder`, `setTimeout`, `console`) ni Google (`SpreadsheetApp`, `DriveApp`, `Utilities`, `LockService`, `ScriptApp`, `PropertiesService`, `CacheService`, `UrlFetchApp`, `Session`, `HtmlService`, `Logger`) |
| R2 | Déterminisme : sont interdits `Date` (`new Date`, `Date.now`), `Math.random`, `localeCompare`, `Intl`, `toLocale*`. Tout tri utilise un comparateur explicite à ordre total : chaînes comparées par unités de code UTF-16 (`a<b?-1:a>b?1:0`), nombres numériquement, départage final explicite |
| R3 | Syntaxe ES2019 : sont interdits `?.`, `??`, `.at(`, `replaceAll`, `Object.hasOwn`, `structuredClone`, `BigInt`, `import` / `export`, champs privés `#x` [À VÉRIFIER SP12] |
| R4 | Le cœur ne modifie jamais ses entrées : il renvoie de nouveaux objets (tests sur entrées gelées en profondeur) |
| R5 | Le cœur n'écrit aucun journal. Les erreurs ne contiennent aucune donnée comptable, aucun nom de fichier ni libellé (S8) |
| R6 | Heures et identifiants sont **injectés** (`horodatage`, `publication_id`, `decision_id`…). Le cœur n'en génère aucun, sauf les identifiants dérivés décrits ici |

**Test statique `test/architecture.test.js`**
- (a) Recherche par expressions régulières dans `src/core/*.js`, commentaires retirés, des motifs de R1 à R3.
- (b) Seule forme de `require` admise : `require('./<fichier>')`, à l'intérieur du gabarit.
- (c) Chargement de tous les fichiers du cœur, dans l'ordre de `ordre.json`, dans `vm.createContext({})` (sans `require` ni `module`) : chaque nom global doit exister. Cela simule l'espace global d'Apps Script.
- (d) `controles.js` ne référence ni `parseMontant` ni `parseDate`.

### 2.4 Port injecté (unique à cette étape)

```js
/** @typedef {{ sha256Hex: function(string): string }} Hasher
 *  SHA-256 des octets UTF-8 du texte, 64 caractères hexadécimaux minuscules.
 *  Le cœur vérifie le format au premier appel (/^[0-9a-f]{64}$/), sinon ErreurContrat HASHER_INVALIDE.
 *  Vecteur obligatoire : sha256Hex("abc") = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".
 *  Vecteur non ASCII figé dans test/, calculé par un outil indépendant (ex. sha256sum). */
```

**Adaptateurs Node**
- `decoder(octets, "UTF-8" | "windows-1252")` utilise `new TextDecoder(label, {fatal:false})`.
- Le BOM peut être retiré par le décodeur ; le cœur le retire de toute façon.
- La prise en charge de `windows-1252` par Node 22 (ICU complet) est [À VÉRIFIER] par un test : octet 0x80 → « € ».
- Aucun contenu n'est journalisé.

---

## 3. Types de données

Règles communes :
- Texte absent = `""` (jamais `null` ni `undefined`).
- Montants en **centimes entiers** (`Number.isSafeInteger`), aucune arithmétique flottante.
- Dates `AAAA-MM-JJ`.
- Horodatages `AAAA-MM-JJTHH:MM:SSZ`.
- Comptes complétés à droite par des `0` jusqu'à `L`.

```js
/** @typedef {Object} Client
 * @property {string} client_id        /^[A-Z0-9][A-Z0-9-]{1,31}$/ (donc sans « | » ni « # »)
 * @property {string} siren            9 chiffres
 * @property {number} longueur_compte  L, entier 4..12 [V-EC D18]
 * @property {Exercice[]} exercices    id uniques, intervalles disjoints, debut <= fin
 * @property {{suppr_masse_pct:number, suppr_masse_nb:number}} seuils  entiers >= 0 (D7 : 5 et 50)
 */
/** @typedef {{id:string, debut:string, fin:string, statut:"OUVERT"|"CLOTURE"}} Exercice */

/** @typedef {Object} Profil
 * @property {string} profil_id
 * @property {number} version                      entier >= 1
 * @property {"FEC"|"GL"} type
 * @property {"UTF-8"|"windows-1252"} encodage     appliqué par l'adaptateur ; recopié dans la trace
 * @property {"\t"|"|"|";"} separateur
 * @property {","|"."} decimal                     différent du séparateur
 * @property {"AAAAMMJJ"|"JJ/MM/AAAA"|"AAAA-MM-JJ"} format_date
 * @property {"DEBIT_CREDIT"|"MONTANT_SENS"} mode_sens
 * @property {Object<string, ChampSource>} colonnes  en-tête source exact -> champ ; chaque champ au plus une fois
 * @property {string[]} colonnes_ignorees            disjointes des clés de colonnes
 * @property {{D:string[], C:string[]}} valeurs_sens obligatoire si MONTANT_SENS ; listes non vides et disjointes
 * @property {string[]} lettrage_vide                ex. ["0","null"]
 * @property {"EXERCICE"} portee_numerotation        seule valeur acceptée à cette étape
 * @property {boolean} contiguite_ecritures
 */
/** @typedef {"journal_code"|"journal_lib"|"ecriture_num"|"ecriture_date"|"compte_num"|"compte_lib"|
 *  "comp_aux_num"|"comp_aux_lib"|"piece_ref"|"piece_date"|"ecriture_lib"|"debit"|"credit"|"montant"|"sens"|
 *  "ecriture_let"|"date_let"|"valid_date"|"montant_devise"|"idevise"} ChampSource */

/** @typedef {{exercice_id:string, du:string, au:string}} Perimetre   tous journaux ; du <= au, inclus dans l'exercice */

/** @typedef {Object} LigneCanonique
 *  -- 18 champs FEC normalisés --
 * @property {string} journal_code  @property {string} journal_lib  @property {string} ecriture_num
 * @property {string} ecriture_date @property {string} compte_num   @property {string} compte_lib
 * @property {string} comp_aux_num  @property {string} comp_aux_lib @property {string} piece_ref
 * @property {string} piece_date    @property {string} ecriture_lib @property {number} debit_cts
 * @property {number} credit_cts    @property {string} ecriture_let @property {string} date_let
 * @property {string} valid_date    @property {number|null} montant_devise_cts  @property {string} idevise
 *  -- techniques --
 * @property {string} client_id     @property {string} exercice_id   (= perimetre.exercice_id)
 * @property {string} cle_ecriture  client_id|exercice_id|journal_code|ecriture_num
 * @property {number} montant_cts   debit_cts - credit_cts
 * @property {string} compte_num_source   valeur source après normTexte, avant compactage et complément
 * @property {"FEC"|"GL"} source_type     @property {string} profil_id   @property {number} profil_version
 * @property {string} source_import_id    @property {number} source_rang  ligne physique de début (1 = en-tête)
 */
/** @typedef {LigneCanonique & {ligne_uid:string, h_fond:string, h_desc:string, h_let:string,
 *   retenue:boolean, statut:string}} LigneStaging   retenue=false pour les blocs DOUBLON_INTRA ignorés */

/** @typedef {LigneCanonique & {ligne_uid:string, version:number, statut:"ACTIVE"|"SUPPRIMEE_SOURCE",
 *   first_import_id:string, last_publication_id:string, h_fond:string, h_desc:string, h_let:string}} LigneActive
 *  Champs exactement ceux de CHAMPS_ACTIF (§5.3). */

/** @typedef {{rang:number, motif:MotifRejet, champ:string}} Rejet   aucune valeur source */
/** @typedef {"GUILLEMET"|"COLONNES"|"CHP_VIDE"|"DATE"|"MONTANT"|"PRECISION"|"DC_DOUBLE"|"SENS_INCONNU"|
 *   "COMPTE_NON_NUM"|"COMPTE_LONG"|"CAR_INTERDIT"} MotifRejet */

/** @typedef {Object} Anomalie
 * @property {string} anomalie_id      code|objet_type|objet_cle (unique dans l'import)
 * @property {string} import_id        @property {string} code    (§17)
 * @property {"BND"|"B"|"A"|"I"} gravite
 * @property {"FICHIER"|"ACTIF"|"EXERCICE"|"ECRITURE"|"COMPTE"} objet_type
 * @property {string} objet_cle        cle_ecriture, compte_num, exercice_id, ou motif pour FICHIER
 * @property {string} attendu  @property {string} obtenu  @property {string} ecart   sérialisés (§5.1)
 * @property {number} nb               nombre de lignes ou d'écritures concernées
 * @property {number[]} rangs          @property {string[]} cles   triés
 * @property {string} mention          "" ou "VALIDEE"
 * @property {string} empreinte_objet  @property {string} empreinte_derogation   (§5.5)
 * @property {"OUVERTE"|"EN_COURS"|"RESOLUE"|"DEROGEE"|"ACQUITTEE"} statut   (création : OUVERTE)
 * @property {string} control_version
 */

/** @typedef {Object} ResultatLecture
 * @property {boolean} structure_ok    false si STR_ENCODAGE, STR_ENTETE ou CLI_MISMATCH (lignes = [])
 * @property {string[]} entete
 * @property {LigneCanonique[]} lignes @property {Rejet[]} rejets
 * @property {{rang:number, debit:string, credit:string, montant:string, sens:string}[]} montants_bruts
 * @property {{lignes_physiques:number, lues:number, normalisees:number, rejetees:number, vides:number}} compteurs
 * @property {{debit_cts:number, credit_cts:number}} totaux   sur les lignes normalisées
 * @property {Anomalie[]} anomalies
 */

/** @typedef {Object} EcritureClassee
 * @property {string} cle  @property {string} exercice_id  @property {string} journal_code  @property {string} ecriture_num
 * @property {"NOUVELLE"|"INCHANGEE"|"MODIFIEE"|"ABSENTE"|"COLLISION"|"DOUBLON_INTRA"} statut
 * @property {("M_FOND"|"M_DATE"|"M_DESC"|"M_LET")[]} sous_types   dans cet ordre
 * @property {number} bloc              1 ; >= 2 pour les blocs DOUBLON_INTRA ignorés ; 0 si ABSENTE
 * @property {number[]} rangs           @property {string[]} ligne_uids_base
 * @property {string} ecriture_date     @property {string} ecriture_date_base
 * @property {number} version_base      0 si inexistante
 * @property {boolean} validee_base     @property {boolean} validee_fichier   (au moins une valid_date non vide)
 * @property {boolean} reactivation     clé présente dans B en SUPPRIMEE_SOURCE
 * @property {string} h_ecr  @property {string} h_ecr_base   "" si absent
 * @property {string} aide              "" ou "PROBABLEMENT_VALIDEE_SOUS_NOUVEAU_NUMERO" (ABSENTE non validée)
 */
/** @typedef {{ecritures:EcritureClassee[], staging:LigneStaging[], compteurs:CompteursComparaison}} ResultatComparaison */
/** @typedef {{par_statut:Object<string,number>, par_sous_type:Object<string,number>, ecritures_fichier:number,
 *   lignes_retenues:number, lignes_doublons_ignorees:number, ecritures_base_perimetre:number}} CompteursComparaison */

/** @typedef {{debit_cts:number, credit_cts:number, debit_cts_confirmation:number, credit_cts_confirmation:number,
 *   nb_lignes:(number|null), source:"SAISIE_MANUELLE", saisi_par:string, saisi_le:string}} TotalSaisi   (A6) */

/** @typedef {Object} ResultatImport   agrégat soumis à la validation puis à la publication
 * @property {string} import_id  @property {string} client_id  @property {string} file_sha256
 * @property {Perimetre} perimetre  @property {{profil_id:string, version:number, type:string}} profil_ref
 * @property {string} version_regles  @property {ResultatLecture} lecture  @property {ResultatComparaison} comparaison
 * @property {Anomalie[]} anomalies   @property {TotalSaisi|null} total_saisi
 */

/** @typedef {DecisionAbsente|DecisionDerogation|DecisionAcquittement} Decision */
/** @typedef {{decision_id:string, type:"ABSENTE", import_id:string, cle:string, choix:"ACCEPTER"|"REPORTER",
 *   motif:string, par:string, le:string}} DecisionAbsente    motif non vide */
/** @typedef {{decision_id:string, type:"DEROGATION", import_id:string, anomalie_id:string, empreinte_derogation:string,
 *   motif:string, reference:string, par:string, le:string, origine:"MANUELLE"|"RECONDUCTION",
 *   source_decision_id:string}} DecisionDerogation */
/** @typedef {{decision_id:string, type:"ACQUITTEMENT", import_id:string, code:string, anomalie_ids:string[],
 *   commentaire:string, par:string, le:string}} DecisionAcquittement   liste explicite, jamais de joker */

/** @typedef {Object} Validation   (A7)
 * @property {string} validation_id  @property {string} import_id  @property {string} client_id
 * @property {"VALIDE"|"REJETE"} decision
 * @property {string} empreinte_staging   figée à la validation (§5.4)
 * @property {string} checksum_base       checksumActif(base) au moment de la validation
 * @property {string} version_base        versionActif au moment de la validation ("" si actif vide)
 * @property {{fichier_plus_recent:boolean, variations_expliquees:boolean, decisions_revues:boolean}} checklist
 * @property {string} soumis_par  @property {string} soumis_le  @property {string} valide_par  @property {string} valide_le
 */

/** @typedef {Object} Mouvement
 * @property {string} mouvement_id      publication_id + ":" + rang sur 6 chiffres (ordre cle_ecriture, ligne_uid)
 * @property {string} publication_id    @property {"PUBLICATION"|"ANNULATION"} type_pub  @property {string} import_id
 * @property {string} ligne_uid         @property {string} cle_ecriture
 * @property {"INSERTION"|"MODIFICATION"|"LETTRAGE"|"SUPPRESSION_LOGIQUE"|"RETRAIT_LIGNE"} type
 * @property {string[]} sous_types  @property {number} version_avant  @property {number} version_apres
 * @property {string} h_avant  @property {string} h_apres   hLigne ; "" si la ligne n'existe pas
 * @property {LigneActive|null} image_avant   image complète avant changement
 * @property {string} annule_mouvement_id     annulation seulement
 */
/** @typedef {Object} Publication
 * @property {string} publication_id  @property {"PUBLICATION"|"ANNULATION"} type_pub
 * @property {string} import_id  @property {string} validation_id  @property {string} publication_precedente_id
 * @property {string} annule_publication_id   @property {string} checksum_avant  @property {string} checksum_apres
 * @property {number} nb_lignes_avant  @property {number} nb_lignes_apres
 * @property {number} sigma_debit_actives  @property {number} sigma_credit_actives   (lignes ACTIVE après)
 * @property {Object<string,number>} nb_mouvements_par_type
 * @property {"PUBLIEE"|"ANNULEE"} statut  @property {string} annulee_par  @property {string} horodatage
 */
```

`RETRAIT_LIGNE` est ajouté à la liste du §14.1. Raison : avec la version à l'écriture entière (A8), une écriture modifiée peut perdre des lignes ; elles quittent l'actif et leur image est conservée dans le mouvement.

---

## 4. Fonctions publiques

**Politique d'erreur**
- Un problème **de données** produit des `Rejet` ou des `Anomalie`, jamais une exception.
- Une violation **de contrat** (argument manquant, profil, client ou périmètre invalide, `client_id` incohérent, Hasher invalide) lève `ErreurContrat` : `Error` avec `code` et `champ`, message = `code`, sans aucune donnée.
- Codes d'erreur : `ARGUMENT_MANQUANT`, `PROFIL_INVALIDE`, `CLIENT_INVALIDE`, `PERIMETRE_INVALIDE`, `CLIENT_INCOHERENT`, `HASHER_INVALIDE`, `SERIALISATION_INVALIDE`.

**Déterminisme** : toute fonction est pure. Pour des entrées égales, les sorties sont égales en profondeur, tableaux compris, dans l'ordre spécifié.

### 4.1 `normalisation.js` (`norm_v1`)

| Fonction | Contrat |
|---|---|
| `verifierEncodage(texte) → {ok, texte, motif}` | Retire U+FEFF initial, applique la normalisation NFC [À VÉRIFIER SP : `normalize` en V8 Apps Script]. `motif` = `"FFFD"` si U+FFFD est présent ; `"DOUBLE_ENCODAGE"` si U+00C3 ou U+00C2 est suivi d'un caractère U+0080–U+00BF (ou de l'un des caractères windows-1252 0x80–0x9F), ou si la séquence `â€` apparaît ; sinon `null`. Motifs versionnés `enc_v1` |
| `normTexte(s) → string` | Caractères U+0000–U+001F et U+007F–U+009F remplacés par une espace. Suites d'espaces (U+0020, U+00A0, U+2007, U+202F) réduites à une U+0020, puis trim. **Garantit l'absence de U+001F** |
| `neutraliser(s) → {valeur, neutralise}` | Si `s` commence par `=`, `+`, `-` ou `@` : `valeur = "'" + s`. N'est **pas** appliquée aux valeurs canoniques : elle le sera par l'adaptateur Sheets (SP1). Le cœur compte seulement les champs concernés (SEC_NEUTRALISE) |
| `parseMontant(s, decimal) → {ok, cts, vide} \| {ok:false, motif}` | Voir les règles ci-dessous |
| `parseDate(s, format) → {ok, iso, vide} \| {ok:false, motif:"DATE"}` | Après trim, `""` → `{ok:true, iso:"", vide:true}`. Format exact du profil, jour calendaire valide (années bissextiles), année 1900–2100. Aucune devinette |
| `normCompte(s, L) → {ok, compte, source, compact} \| {ok:false, motif}` | `source` = normTexte. `compact` = source sans espaces, `.` ni `-`. Non `/^\d+$/` → `COMPTE_NON_NUM` (dont `401DUPONT`). Longueur > L → `COMPTE_LONG`. Sinon complément à droite par `0` jusqu'à L. Jamais de troncature |

Règles de `parseMontant` :
- Retrait de U+0020, U+00A0 et U+202F ; `""` → `{ok:true, cts:0, vide:true}`.
- Au plus un marqueur négatif : `-` en tête, `-` en fin, ou parenthèses ; `+` admis en tête.
- Corps : `\d+(D\d{1,2})?`, ou `\d{1,3}(T\d{3})+(D\d{1,2})?`, ou `D\d{1,2}`, avec D = séparateur décimal et T = l'autre caractère de `{.,}`.
- Plus de 2 décimales (même nulles) → `PRECISION`. Autre écart → `MONTANT`.
- Conversion par les chiffres, sans flottant ; `-0` → `0` ; hors entier sûr → `MONTANT`.
- Exemples : `"1 234,56"` → 123456 ; `"(1.234,56)"` → −123456 ; `"12,00-"` → −1200 ; `"1234,5"` → 123450.

### 4.2 `csv.js`

`parseCsv(texte, {separateur}) → {entete, enregistrements:[{rang, ligne_fin, champs}], lignes_vides:number[], erreurs:[{rang, motif}]}`
- Syntaxe RFC 4180 : champ entre guillemets, `""` échappé, fins de ligne `\r\n`, `\n` ou `\r` ; dernière ligne sans terminateur admise.
- `rang` = n° de la ligne physique où commence l'enregistrement ; `ligne_fin` = sa dernière ligne physique.
- Ligne physique de longueur nulle → `lignes_vides`.
- Nombre de champs différent de l'en-tête → `erreurs` (motif `COLONNES`), l'enregistrement est absent de `enregistrements`.
- Guillemet non fermé → `erreurs` (motif `GUILLEMET`) au rang de début, puis arrêt.
- Les champs sont rendus **bruts**, non normalisés.

### 4.3 `profil.js`

| Fonction | Contrat |
|---|---|
| `validerProfil(p) → {ok, erreurs:[{code, champ}]}` | Vérifie toutes les contraintes du type `Profil`. Champs obligatoires : `journal_code`, `ecriture_num` (**A1** : grand livre sans numéro refusé, message « exporter le FEC »), `ecriture_date`, `compte_num`, `ecriture_lib`, puis `debit` + `credit` ou `montant` + `sens` selon `mode_sens`, et `piece_ref` pour le FEC. `portee_numerotation` différente de `"EXERCICE"` → erreur |
| `validerClient(c)`, `validerPerimetre(per, c)` | Lèvent `CLIENT_INVALIDE` ou `PERIMETRE_INVALIDE`. Le périmètre doit nommer un exercice existant, avec `debut ≤ du ≤ au ≤ fin` |
| `mapperEntete(entete, p) → {ok, index:{champ→position}, erreurs:[{motif:"COLONNE_INCONNUE"\|"COLONNE_MANQUANTE"\|"COLONNE_DUPLIQUEE", colonne}]}` | Comparaison exacte après normTexte, sensible à la casse. Toute colonne doit figurer dans `colonnes` ou `colonnes_ignorees` |

### 4.4 `identite.js`

| Fonction | Contrat |
|---|---|
| `cleEcriture(ligne, profil) → string` | `client_id\|exercice_id\|journal_code\|ecriture_num`. Lève une erreur si la portée diffère d'EXERCICE |
| `empreintes(ligne, hasher) → {h_fond, h_desc, h_let}` | §5.2 |
| `hLigne(ligneActive, hasher) → string` | §5.3 |
| `hEcriture(lignes, hasher) → string` | §5.2 (h_ecr) |
| `attribuerLigneUid(lignesDUneEcriture) → LigneStaging[]` | Tri par (compte_num, comp_aux_num, montant_cts numérique, source_rang), puis `ligne_uid = cle_ecriture + "#" + k`, k = 1..n |

### 4.5 `lecture.js`

`normaliserFichier({texte, nomFichier, profil, client, perimetre, import_id, file_sha256}) → ResultatLecture`

Étapes, dans l'ordre :
1. `validerProfil`, `validerClient`, `validerPerimetre` (exception si invalide).
2. `verifierEncodage` → STR_ENCODAGE, puis arrêt.
3. Si FEC : nom de base conforme à `/^(\d{9})FEC(\d{8})/i` et SIREN égal à `client.siren`, sinon CLI_MISMATCH et arrêt.
4. `parseCsv` puis `mapperEntete` → STR_ENTETE et arrêt.
5. Normalisation de chaque enregistrement :
   - journal_code, comp_aux_num et idevise : normTexte puis majuscules ; autres textes : normTexte, casse conservée.
   - Lettrage figurant dans `lettrage_vide` → `""`.
   - Toutes les dates passent par `parseDate`.
   - Montants : soit débit / crédit, soit montant + sens (sens comparé après normTexte et majuscules aux `valeurs_sens`, sinon `SENS_INCONNU`).
   - Débit et crédit non nuls → `DC_DOUBLE`. Débit et crédit vides tous les deux, ou montant vide → `CHP_VIDE`.
   - Montant négatif : **signe conservé dans sa colonne**, pas de reclassement (MNT_NEG, I) [V-EC D17]. `montant_cts = debit_cts - credit_cts`.
   - `\|` dans journal_code ou ecriture_num → `CAR_INTERDIT`.
   - Champ indispensable vide (§16.1) → `CHP_VIDE`.
6. Enregistrement dont tous les champs sont vides après normTexte → compté dans `vides`.
7. Tout rejet → anomalie REJ_LIGNES (BND), agrégée par motif. **A2** : ligne rejetée = import bloqué.
8. Ligne hors périmètre → PER_HORS_PERIMETRE (BND, agrégée) ; la ligne reste dans `lignes`.

Compteurs :
- `lues = normalisees + rejetees + vides`
- `lignes_physiques = 1 + Σ(ligne_fin − rang + 1) + |lignes_vides|`, sur enregistrements et erreurs.

**A3** : aucune détection de lignes parasites. Une ligne « Total compte » est rejetée et bloque l'import ; un export tabulaire est exigé.

### 4.6 `comparaison.js`

`detecterReimport(file_sha256, imports) → boolean` — vrai si un import du client au statut PUBLIE, non annulé, porte ce `file_sha256`. L'appelant produit alors REIMPORT_FICHIER et s'arrête.

`classer({base, lignes, perimetre, profil, hasher}) → ResultatComparaison`

1. Tous les objets doivent avoir le même `client_id`, sinon `CLIENT_INCOHERENT`. Toutes les `lignes` doivent avoir `exercice_id = perimetre.exercice_id`.
2. Regroupement de F par `cle_ecriture` (ordre des rangs).
   - Plusieurs `ecriture_date` → **COLLISION**.
   - Si `contiguite_ecritures` : un bloc est une suite maximale de lignes consécutives de même clé, dans la séquence des lignes normalisées (lignes vides et rejetées ignorées). Plusieurs blocs : tous identiques (même date, même multiensemble T_fdl) → bloc 1 retenu, les autres en **DOUBLON_INTRA** (`retenue=false`) ; sinon **COLLISION** (toute la clé).
   - Grand livre non contigu : doublons non détectables, repli sur REC_TOTAL_SAISI.
3. Calcul des empreintes et de `attribuerLigneUid` sur les blocs retenus.
4. **B comparée** = lignes de B où `exercice_id = perimetre.exercice_id` ET (clé présente dans F OU (statut ACTIVE ET `du ≤ ecriture_date ≤ au`)).
   - Une clé de F déjà présente dans B **hors** période est donc comparée, jamais traitée en NOUVELLE. Ainsi l'actif ne peut jamais contenir deux fois la même clé.
5. Pour chaque clé de F hors COLLISION :
   - absente de B → **NOUVELLE** ;
   - présente dans B en SUPPRIMEE_SOURCE → **NOUVELLE** avec `reactivation=true` ;
   - sinon, soit T_f, T_fd et T_fdl les multiensembles triés de `h_fond`, de `h_fond+h_desc` et de `h_fond+h_desc+h_let` :
     - T_fdl égaux et même date → **INCHANGEE** ;
     - sinon **MODIFIEE** avec : `M_FOND` si T_f diffère ; `M_DATE` si la date diffère ; `M_DESC` si T_f est égal et T_fd diffère ; `M_LET` si T_fd est égal et T_fdl diffère.
6. Clé ACTIVE de B comparée, absente de F et hors COLLISION → **ABSENTE**. Si `validee_base` est faux, `aide` est renseignée.
7. Sortie triée par (cle, bloc). `ecritures_base_perimetre` = nombre d'écritures ACTIVE de B datées dans le périmètre.

### 4.7 `anomalies.js`

| Fonction | Contrat |
|---|---|
| `creerAnomalie({import_id, code, gravite?, objet_type, objet_cle, attendu, obtenu, ecart, rangs, cles, mention, h_concernees}, ctx, hasher) → Anomalie` | Gravité par défaut prise dans `Constantes.CODES`. Calcule `empreinte_objet` et `empreinte_derogation` (§5.5). `ctx = {perimetre, statut_exercice, profil_ref, version_regles}` |
| `appliquerDecisions(anomalies, decisions, ecritures) → {anomalies, erreurs:[{code, decision_id}]}` | DEROGATION valide si l'anomalie existe, a la gravité B, si son ED est égale, si le motif (trim) compte au moins 20 points de code et si `par` est non vide → DEROGEE ; sinon erreur `PUB_DEROGATION_INVALIDE`. ACQUITTEMENT : chaque id listé, de gravité A et de code identique → ACQUITTEE. Décision ABSENTE → l'anomalie IDN_ABSENTE de la clé passe ACQUITTEE si elle est de gravité A (en gravité B, une dérogation reste requise) |
| `reconduireDerogations({anomalies, derogations_precedentes, import_id, horodatage}) → DecisionDerogation[]` | §5.5 |

### 4.8 `publication.js`

| Fonction | Contrat |
|---|---|
| `versionActif(publications) → string` | `publication_id` de la **dernière publication appliquée**, PUBLICATION ou ANNULATION ; `""` si aucune. Une annulation change donc la version (pas d'effet ABA) |
| `checksumActif(actif, hasher) → string` | §5.3 ; lignes ACTIVE et SUPPRIMEE_SOURCE incluses |
| `simulerActif({base, comparaison, decisions, hypothese}) → LigneActive[]` | `hypothese` = `"ABSENTES_ACCEPTEES"` pour les contrôles, `"DECISIONS"` pour la publication. Mêmes règles d'effet que `planifierPublication` |
| `empreinteStaging({resultat, decisions}, hasher) → string` | §5.4 |
| `planifierPublication({base, publications, resultat, decisions, validation, autre_import_en_cours, publication_id, horodatage, hasher}) → {ok:true, actif_suivant, mouvements, publication} \| {ok:false, refus:string[]}` | §7 et §4.9 |
| `planifierAnnulation({actif, publications, mouvements, publication_id_annulee, import_en_cours, tampon_inactif?, publication_id, horodatage, hasher}) → {ok:true, actif_restaure, mouvements_inverses, publication_annulation, publication_annulee} \| {ok:false, refus}` | §4.9 |

### 4.9 Effets de la publication et de l'annulation (A8 : version à l'écriture entière)

| Classification | Effet sur l'actif | Mouvements |
|---|---|---|
| NOUVELLE | Insertion des lignes retenues : `version=1`, ACTIVE, `first_import_id = source_import_id = import_id` | INSERTION |
| NOUVELLE `reactivation` / MODIFIEE | Retrait de toutes les lignes de la clé, insertion des nouvelles lignes en `version_base+1` ; `first_import_id` repris de B ; `source_import_id`, `source_rang` du fichier | Même `ligne_uid` avant et après → MODIFICATION, ou LETTRAGE si `sous_types = [M_LET]`. Après seulement → INSERTION. Avant seulement → RETRAIT_LIGNE |
| ABSENTE + ACCEPTER | Statut SUPPRIMEE_SOURCE, `version+1` ; `source_*` inchangés | SUPPRESSION_LOGIQUE |
| ABSENTE + REPORTER, INCHANGEE, DOUBLON_INTRA ignoré | Aucun | Aucun |

Règles complémentaires :
- `last_publication_id = publication_id` sur toute ligne touchée.
- Au plus **un** mouvement par couple (`publication_id`, `ligne_uid`).
- Une publication sans changement donne 0 mouvement et `checksum_apres = checksum_avant`.

**REC_PUBLICATION, vérifié dans `planifierPublication` avant de rendre `ok:true`**
- (a) Pour chaque mouvement : `h_avant = hLigne(image_avant)`, et cette ligne existe dans `base` ; `h_apres = hLigne` de la ligne de `actif_suivant`.
- (b) Défaire les mouvements depuis `actif_suivant` doit redonner `checksumActif(base)`. Cela prouve la réversibilité **avant** la bascule.
- (c) Σ débit ACTIVE après = Σ avant + Σ(après) − Σ(avant), et de même pour le crédit.
- Tout écart → refus `PUB_REC_PUBLICATION`.

**Annulation**

Refus possibles :
- `ANN_PAS_DERNIERE` : la publication n'est pas celle de `versionActif`.
- `ANN_DEJA_ANNULEE`.
- `ANN_TYPE` : annulation d'une annulation.
- `ANN_IMPORT_EN_COURS`.
- `ANN_ACTIF_ALTERE` : `checksumActif(actif)` ≠ `checksum_apres` de la publication.

Reconstruction : INSERTION → retrait ; tout autre type → restauration de `image_avant`.

Vérification : checksum, nombre de lignes, Σ débit et Σ crédit ACTIVE égaux à ceux d'avant la publication. Sinon refus `ANN_VERIFICATION`. Si `tampon_inactif` est fourni, son checksum doit aussi être égal, sinon `ANN_TAMPON_DIVERGENT`.

Résultat :
- Mouvements inverses de type `ANNULATION`, avec `annule_mouvement_id`.
- Publication R : `annule_publication_id = P`, `checksum_avant = P.checksum_apres`, `checksum_apres = P.checksum_avant`.
- `publication_annulee` = P avec `statut ANNULEE` et `annulee_par = R`.

### 4.10 `controles.js`

`executerControles(ctx) → {controles:[{control_id, control_version, attendu, obtenu, ecart, ok}], anomalies:Anomalie[], variations:[{compte, avant_cts, apres_cts, delta_cts}]}`

`ctx = {client, profil, perimetre, import_id, texte, lecture, comparaison, base, publications, total_saisi, version_regles, hasher}`.

- Si `lecture.structure_ok` est faux : seules les anomalies de structure sont rendues.
- Anomalies triées par `anomalie_id`.
- `variations` : soldes du compte sur l'exercice, base ACTIVE avant et `simulerActif` (hypothèse ABSENTES_ACCEPTEES) après ; deltas non nuls ; tri par |delta| décroissant, puis par compte.

Fonctions auxiliaires :
- `soldesParCompte(lignes) → {compte: cts}`
- `recompterLignesPhysiques(texte)` : découpage par `/\r\n|\n|\r/`, segment final vide non compté.
- `totauxBruts(montants_bruts, profil)` : parseur minimal indépendant, §6.

---

## 5. Sérialisation, empreintes, checksum

### 5.1 Règles générales

- `US` = U+001F.
- `H(nom, valeurs) = "v1:" + hasher.sha256Hex("v1:" + nom + US + valeurs.join(US))`. Le nom sépare les familles d'empreintes.
- Encodage des valeurs :
  - chaîne : telle quelle (déjà normalisée) ;
  - entier : `String(n)` en base 10, sans `+` ;
  - `null` / absent : `""` ;
  - booléen : `"1"` / `"0"`.
- Une valeur contenant U+001F lève `SERIALISATION_INVALIDE`.
- `Coll(nom, items) = H(nom, [String(items.length)].concat(items))`, avec `items` dans l'ordre précisé ; à défaut, triés par unités de code.

### 5.2 Empreintes de ligne et d'écriture

| Empreinte | Valeurs, dans cet ordre |
|---|---|
| `h_fond = H("h_fond", …)` | compte_num, comp_aux_num, debit_cts, credit_cts, idevise, montant_devise_cts |
| `h_desc = H("h_desc", …)` | ecriture_lib, piece_ref, piece_date, journal_lib, compte_lib, comp_aux_lib, valid_date |
| `h_let = H("h_let", …)` | ecriture_let, date_let |
| `h_ecr = H("ecriture", …)` | cle_ecriture, ecriture_date, puis la liste **triée** des concaténations `h_fond+h_desc+h_let` de chaque ligne (éléments de longueur fixe) |

### 5.3 Ligne active et checksum

`CHAMPS_ACTIF`, dans cet ordre (36 champs) :

`client_id, exercice_id, cle_ecriture, ligne_uid, version, statut, journal_code, journal_lib, ecriture_num, ecriture_date, compte_num, compte_lib, comp_aux_num, comp_aux_lib, piece_ref, piece_date, ecriture_lib, debit_cts, credit_cts, ecriture_let, date_let, valid_date, montant_devise_cts, idevise, montant_cts, compte_num_source, source_type, profil_id, profil_version, first_import_id, source_import_id, source_rang, last_publication_id, h_fond, h_desc, h_let`

- `hLigne = H("ligne", valeurs de CHAMPS_ACTIF)`.
- `checksumActif = H("actif", [String(n)].concat(hLigne des lignes triées par ligne_uid))`.
- Actif vide : `H("actif", ["0"])`.
- Le hachage ligne par ligne permet aussi de localiser une altération (diagnostic de SYS_ACTIF_ALTERE). Le coût est mesuré par SP2.

### 5.4 Empreinte de staging (A7)

`empreinte_staging = H("staging", [import_id, client_id, exercice_id, du, au, profil_id, profil_version, type, version_regles, file_sha256, Lignes, Ecritures, Anomalies, Decisions, TS])`, où :

| Élément | Définition |
|---|---|
| `Lignes` | `Coll("staging_lignes", …)` des `H("ligne_staging", [source_rang, cle_ecriture, ligne_uid, retenue, statut, journal_code, ecriture_num, ecriture_date, compte_num_source, h_fond, h_desc, h_let])`, triés par `source_rang`. Les 18 champs sont couverts via les empreintes |
| `Ecritures` | `Coll` des `H("ecriture_classee", [cle, bloc, statut, sous_types.join(","), version_base, reactivation, h_ecr, h_ecr_base])`, ordre (cle, bloc) |
| `Anomalies` | `Coll` des `H("anomalie", [anomalie_id, code, gravite, statut, empreinte_objet, empreinte_derogation])`, triés par `anomalie_id`, statuts **après** `appliquerDecisions` |
| `Decisions` | `Coll` des `H("decision", [decision_id, type, cible, choix, motif, reference, par, le, origine, source_decision_id])`, triés par `decision_id`. `cible` = cle, anomalie_id, ou code + ids joints par `,` |
| `TS` | `H("total_saisi", [débit, crédit, confirmations, nb_lignes, source, saisi_par, saisi_le])`, ou `""` si absent |

### 5.5 Empreinte de dérogation (A5)

- `empreinte_objet = H("objet", [code, objet_type, objet_cle, attendu, obtenu, ecart, Coll("concernees", h_concernees)])`.
- `h_concernees` selon l'objet :
  - ECRITURE : `[h_ecr_base, h_ecr]` ;
  - COMPTE : `h_ecr` de toutes les écritures retenues qui mouvementent le compte ;
  - FICHIER agrégé : `h_ecr` des clés listées (vide pour les totaux, `attendu` / `obtenu` suffisent).
- `empreinte_derogation = H("derogation", [code, gravite, objet_type, objet_cle, empreinte_objet, perimetre_anomalie, statut_exercice, profil_id, profil_version, version_regles])`.
- `perimetre_anomalie` = `exercice_id` pour ECRITURE et COMPTE ; `exercice_id|du|au` pour FICHIER, EXERCICE et ACTIF. Raison : avec des exports cumulatifs, `au` change chaque mois. L'inclure pour une écriture inchangée empêcherait toute reconduction, contrairement à l'intention d'A5. **À valider (P1).**

Reconduction (`reconduireDerogations`) :
- Pour chaque anomalie de gravité B, si une dérogation de la **dernière publication appliquée** (manuelle ou elle-même reconduite) porte une ED **strictement égale**, une décision `origine:"RECONDUCTION"` est créée.
- `decision_id = "RECOND:" + import_id + ":" + anomalie_id` ; motif copié ; `par = "SYSTEME"` ; `source_decision_id` renseigné ; `le` injecté.
- Elle entre dans l'empreinte de staging : la validation humaine la couvre explicitement.
- Pas de reconduction pour les gravités BND, A et I. Les acquittements ne sont jamais reconduits.
- Tout changement de contenu, de profil ou de sa version, de version des règles, de statut de l'exercice ou de gravité casse la reconduction (repli sûr).

---

## 6. Contrôles implémentés à cette étape, et contrôles indépendants du total saisi (A6)

### 6.1 Contrôles implémentés

| Code | Grav. | Objet | Règle à cette étape |
|---|---|---|---|
| CLI_MISMATCH | BND | FICHIER | FEC : nom non conforme ou SIREN différent de `client.siren` (le contrôle du dossier relève de l'adaptateur, plus tard) |
| STR_ENCODAGE | BND | FICHIER | `verifierEncodage` |
| STR_ENTETE | BND | FICHIER | `mapperEntete` ; `objet_cle = motif\|colonne` |
| REJ_LIGNES | BND | FICHIER | Une anomalie par motif, avec `rangs` |
| SYS_ACTIF_ALTERE | BND | ACTIF | `checksumActif(base)` ≠ `checksum_apres` de la dernière publication appliquée (`H("actif",["0"])` si aucune) |
| PRF_CHANGEMENT | BND | EXERCICE | `source_type` des lignes de B de l'exercice ≠ `profil.type`. Le type de l'exercice est **dérivé de l'actif** ; actif vide pour l'exercice = libre. **A4** : aucun mélange automatique |
| PER_HORS_PERIMETRE | BND | FICHIER | Agrégée par rangs |
| IDN_COLLISION | BND | ECRITURE | Statut COLLISION |
| CPT_COLLISION_PADDING | BND | COMPTE | Au moins 2 valeurs `compact` distinctes, fichier et base confondus, donnant le même `compte_num` |
| REC_LIGNES | BND | FICHIER | (a) `lues = lignes_retenues + rejetees + vides + lignes_doublons_ignorees` ; (b) `recompterLignesPhysiques = lignes_physiques` |
| REC_TOTAUX | BND | FICHIER | `totauxBruts` (parseur indépendant) = `lecture.totaux` |
| REC_MIROIR | BND | FICHIER | `simulerActif(ABSENTES_ACCEPTEES)` restreint à l'exercice, aux lignes ACTIVE datées dans le périmètre, comparé aux lignes retenues : nombre, Σ débit, Σ crédit, solde par compte. Inclut la conservation : Σ delta des variations = Δ(Σ débit − Σ crédit) actif, égal à 0 si toutes les écritures sont équilibrées |
| EQU_GLOBAL | BND FEC / B GL | FICHIER | Σ débit = Σ crédit sur les lignes normalisées |
| EQU_ECRITURE | B | ECRITURE | Σ débit ≠ Σ crédit sur le bloc retenu, tolérance 0 |
| PER_CLOTURE | B | ECRITURE | Exercice CLOTURE et statut NOUVELLE, ABSENTE, ou MODIFIEE avec `sous_types ≠ [M_LET]` |
| VOL_SUPPR_MASSE | B | FICHIER | `absentes*100 > suppr_masse_pct * ecritures_base_perimetre` ou `absentes > suppr_masse_nb` |
| CPT_CLASSE | B | COMPTE | Premier chiffre hors de 1–8 [V-EC classe 9] |
| REC_TOTAL_SAISI | B | FICHIER | Voir §6.2 |
| IDN_ABSENTE | A (B si clôturé) | ECRITURE | Décision obligatoire |
| IDN_MOD_FOND | A | ECRITURE | M_FOND ou M_DATE ; `mention="VALIDEE"` si `validee_base` |
| IDN_DEVALIDEE | A | ECRITURE | `validee_base && !validee_fichier` |
| IDN_DOUBLON_INTRA | A | ECRITURE | `nb` = nombre de blocs ignorés |
| M_DESC, M_LET, MNT_NUL, MNT_NEG, SEC_NEUTRALISE | I | FICHIER | Agrégées : `cles` ou `rangs` et `nb` |

REC_PUBLICATION (BND) est vérifié dans `planifierPublication` (§4.9).

### 6.2 A6 — total saisi manuellement et contrôles indépendants

Le total saisi est accepté **provisoirement** (`source:"SAISIE_MANUELLE"`, avec saisi_par et saisi_le). Il ne remplace aucun contrôle indépendant.

| # | Contrôle | Indépendant de | Implémenté maintenant |
|---|---|---|---|
| C1 | Double saisie : `debit_cts = debit_cts_confirmation` et `credit_cts = credit_cts_confirmation`, sinon REC_TOTAL_SAISI (motif `SAISIE_NON_CONFIRMEE`) | Erreur de frappe | Oui |
| C2 | Total saisi = `lecture.totaux` des lignes **retenues** ; si `nb_lignes` est fourni, il doit égaler `lignes_retenues` | Parseur et normalisation | Oui |
| C3 | Total absent : GL → REC_TOTAL_SAISI B (motif `TOTAL_ABSENT`) ; FEC → aucun | — | Oui |
| C4 | Recomptage des lignes physiques par découpage brut vs parseur CSV (REC_LIGNES b) | Parseur CSV | Oui |
| C5 | Totaux recalculés sur les chaînes brutes par un parseur minimal distinct : on garde les chiffres et le séparateur décimal, signe si `-` ou `(`, sens comparé après trim et majuscules (REC_TOTAUX). Aucun appel à `normalisation.js` | `parseMontant` | Oui |
| C6 | Équilibre global et par écriture (EQU_GLOBAL, EQU_ECRITURE) | Saisie | Oui |
| C7 | Miroir actif simulé = fichier (REC_MIROIR), conservation des soldes | Comparaison et fusion | Oui |
| C8 | Réversibilité vérifiée avant bascule (REC_PUBLICATION b) | Publication | Oui |
| C9 | Totaux relus après écriture dans Sheets (REC_TOTAUX, variante aller-retour) | Adaptateur Sheets | Non (étape Sheets) |
| C10 | Rapprochement avec la balance du logiciel (REC_BALANCE), variation de volume (VOL_VARIATION) | — | Non (V1.1) |

---

## 7. A7 — Validation et revalidation à la publication

**À la validation**, l'appelant fige dans `Validation` :
- `empreinte_staging = empreinteStaging({resultat, decisions})` ;
- `checksum_base = checksumActif(base)` ;
- `version_base = versionActif(publications)`.

**À la publication**, `planifierPublication` recalcule ces trois valeurs sur les entrées reçues. Il **refuse** si l'une diffère :
- `PUB_STAGING_MODIFIE` : données, classifications, anomalies, statuts ou décisions changés ;
- `PUB_BASE_MODIFIEE` : checksum **ou** version de l'actif changés.

Justification : base inchangée et staging inchangé impliquent une comparaison toujours valide. Il est donc inutile de reclasser.

Refus cumulés, rendus triés (aucun arrêt au premier refus) :

| Refus | Condition |
|---|---|
| `PUB_VALIDATION_ABSENTE` | Validation absente, `decision ≠ VALIDE`, `import_id` ou `client_id` différents, ou `valide_le < soumis_le` |
| `PUB_CHECKLIST` | Une case de la check-list est fausse |
| `PUB_STAGING_MODIFIE`, `PUB_BASE_MODIFIEE` | Ci-dessus |
| `PUB_BND_OUVERT` | Au moins une anomalie BND |
| `PUB_B_NON_DEROGE` | Anomalie B dont le statut n'est pas DEROGEE |
| `PUB_DEROGATION_INVALIDE` | Erreur rendue par `appliquerDecisions` (motif < 20, ED différente, BND dérogée) |
| `PUB_A_NON_ACQUITTE` | Anomalie A dont le statut n'est pas ACQUITTEE |
| `PUB_ABSENTE_SANS_DECISION` | ABSENTE sans `DecisionAbsente` |
| `PUB_IMPORT_EN_COURS` | `autre_import_en_cours` vrai |
| `PUB_REC_PUBLICATION` | §4.9 |

T15 attend 6 refus : BND, B non dérogé, A non acquitté, ABSENTE sans décision, staging modifié, motif de 19 caractères.

---

## 8. A4 — Migration contrôlée grand livre ↔ FEC (spécification, non implémentée)

**Principe** : le mélange automatique est interdit (PRF_CHANGEMENT, BND). Changer de source pour un exercice déjà alimenté passe par une **publication de type MIGRATION**, explicite, rapprochée, validée et annulable.

1. **Demande** : décision `MIGRATION_DEMANDEE` (exercice, type cible, motif ≥ 20 caractères). Préconditions : aucun import en cours, SYS_ACTIF_ALTERE négatif, exercice OUVERT. Pour un exercice clôturé, une dérogation B est obligatoire.
2. **Import du fichier cible** : périmètre imposé = exercice entier (`du = debut`, `au ≥` date maximale publiée), sinon refus. Lecture et contrôles de structure standards ; tout BND bloque.
3. **Rapprochement** source actuelle (actif ACTIVE de l'exercice) ↔ fichier cible. Pas de `classer` : les numéros peuvent différer.

   | # | Rapprochement | Écart |
   |---|---|---|
   | M1 | Nombre de lignes, Σ débit, Σ crédit | BND |
   | M2 | Solde par compte (tous les comptes) | BND |
   | M3 | Σ débit et Σ crédit par journal × mois | B |
   | M4 | Appariement par écriture : par clé si la numérotation est identique, sinon par (journal_code, ecriture_date, liste triée des `h_fond`) ; listes des non-appariées des deux côtés ; taux d'appariement | B si non appariées |
   | M5 | Différences de descriptif ou de lettrage sur écritures appariées | I |

4. **Rapport de migration** : compteurs, écarts, table de correspondance ancienne clé → nouvelle clé, empreinte du rapport. Il est conservé.
5. **Validation** : décision `MIGRATION_VALIDEE` sur la règle A7 (empreinte du rapport et du staging, checksum et version de l'actif figés), dérogations B motivées.
6. **Publication MIGRATION** atomique :
   - toutes les lignes de l'exercice issues de l'ancienne source sont retirées (mouvement `MIGRATION_RETRAIT` avec image complète et `cle_remplacee`) ;
   - les lignes cibles sont insérées (INSERTION, version 1, nouveaux `ligne_uid`) ;
   - le type de l'exercice devient celui de la cible ;
   - REC_PUBLICATION s'applique.
7. **Traçabilité et annulation** : `JOURNAL` (MIGRATION_DEMANDEE, MIGRATION_VALIDEE, PUBLICATION type MIGRATION). Annulation possible tant que c'est la dernière publication (mécanisme §4.9). Les dérogations antérieures ne se reconduisent pas, car `profil_id` change l'ED.

**Réservations dans ce contrat** : `type_pub` `"MIGRATION"`, type de mouvement `MIGRATION_RETRAIT`, champ `cle_remplacee`, types de décision `MIGRATION_DEMANDEE` et `MIGRATION_VALIDEE`. Ils ne sont pas acceptés par le code de cette étape (valeur inconnue → `ErreurContrat`).

---

## 9. Invariants testables

| # | Invariant | Test |
|---|---|---|
| I1 | Déterminisme | Deux exécutions donnent des sorties égales en profondeur ; une permutation des lignes de F donne les mêmes `ecritures`, compteurs et empreintes (hors `source_rang`) ; T02 réordonné en CRLF donne 100 % INCHANGEE |
| I2 | Idempotence | `classer(publier(B,F), F)` = 100 % INCHANGEE ; une seconde publication donne 0 mouvement et un checksum inchangé |
| I3 | Réversibilité | `annuler(publier(B))` : checksum et actif égaux en profondeur à B, triés par `ligne_uid` ; pour tout jeu T01–T11 publiable |
| I4 | Conservation | Σ delta des soldes = Δ(Σ débit − Σ crédit) ; égal à 0 si les écritures sont équilibrées ; T03 : Δ 607000 = +5000 |
| I5 | Isolation client | Tout objet de `client_id` différent → `CLIENT_INCOHERENT` ; même fichier chez A et chez B : aucune `cle_ecriture` ni aucun `ligne_uid` communs, checksums différents |
| I6 | Unicité | `ligne_uid` unique dans l'actif ; pour une clé : un seul exercice, une seule date, une seule version, un seul statut |
| I7 | Aucune perte | REC_LIGNES toujours vérifiable ; chaque ligne normalisée est retenue, ignorée en DOUBLON_INTRA, ou l'import est bloqué |
| I8 | Aucune suppression silencieuse | Une ligne ne quitte ACTIVE que par ABSENTE + ACCEPTER ou par remplacement MODIFIEE, avec image dans le mouvement |
| I9 | Hors périmètre intact | Une écriture de B hors période dont la clé n'est pas dans F n'est jamais touchée (T04) |
| I10 | Entrées immuables | Entrées gelées en profondeur, aucune exception de mutation |
| I11 | Entiers | Tout `*_cts` est `Number.isSafeInteger` |
| I12 | Confidentialité | Aucun `console` dans le cœur ; le message des erreurs correspond à `/^[A-Z_]+$/` et ne contient aucune valeur des jeux |
| I13 | A7 | Toute modification d'une ligne, d'un statut, d'une décision ou de la base après validation provoque un refus |
| I14 | A5 | ED stable si l'ordre des entrées change ; ED différente si un seul composant change |
| I15 | Empreintes | Valeurs de référence figées ; 1 centime de plus → `h_fond` différente ; T07 UTF-8, BOM et windows-1252 → empreintes identiques |

**Jeux de test** : `test/fixtures/Txx/attendu.json`, produit **sans** exécuter le code, contient :
- `lecture.compteurs`, `lecture.totaux` ;
- `comparaison.compteurs`, `comparaison.ecritures[{cle, statut, sous_types, bloc}]` ;
- `anomalies[{code, gravite, objet_type, objet_cle, nb}]` ;
- `variations[{compte, delta_cts}]` ;
- `refus[]` pour T15 ;
- facultativement `empreintes_reference[{rang, h_fond, h_desc, h_let}]`, calculées par un outil indépendant à partir des chaînes du §5.

Les tests comparent ces projections, dans l'ordre spécifié.

---

## 10. Points ouverts

> **v0.2** — P1 à P7 ont été tranchés par le dirigeant le 2026-10-09 : voir §12. P8 à P13 restent ouverts.

| # | Point | Proposition |
|---|---|---|
| P1 | Périmètre retenu dans l'ED pour les anomalies ECRITURE et COMPTE (§5.5) | `exercice_id` seul ; le périmètre complet pour les anomalies de niveau fichier |
| P2 | Gravité de REC_TOTAL_SAISI `TOTAL_ABSENT` pour un grand livre | B (dérogeable, motivée) ; BND si le dirigeant veut rendre la saisie obligatoire sans exception |
| P3 | Montants négatifs : signe conservé dans la colonne, sans reclassement | À confirmer [V-EC D17] |
| P4 | Réapparition d'une écriture SUPPRIMEE_SOURCE | NOUVELLE `reactivation`, sans code dédié ; créer `IDN_REAPPARUE` (A) ? |
| P5 | ABSENTE sur exercice clôturé : IDN_ABSENTE (B) **et** PER_CLOTURE (B), lecture littérale du §17 | Double dérogation ; simplifier en ne levant que PER_CLOTURE ? |
| P6 | Nom de FEC non conforme → CLI_MISMATCH (BND) | À confirmer (repli sûr) |
| P7 | Plus de 2 décimales, même nulles (`1,230`) → rejet | Strict ; à revoir sur les exports pilotes |
| P8 | Séparateurs limités à TAB, `\|` et `;` ; portée limitée à EXERCICE | À rouvrir si un export pilote l'exige |
| P9 | Motifs de double encodage `enc_v1` : risque de faux positifs | Valider sur les exports pilotes anonymisés |
| P10 | Neutralisation appliquée à l'écriture Sheets, pas dans le modèle canonique | À confirmer par SP1 |
| P11 | Équivalence bit à bit de `computeDigest` UTF-8 avec Node, support d'ES2019 et de `normalize` en V8 Apps Script | SP2, SP12 |
| P12 | Compte technique (D4), Workspace | Reportés avant les données réelles (J4) ; sans objet à cette étape |
| P13 | Machine à états, lots, reprise (T13), statut RESOLUE entre imports | Étape suivante (`app/`, ports en mémoire) |

---

## 11. Conformité du prototype au contrat (v0.2)

Le prototype (`import-comptable/`) applique le contrat ainsi amendé. Les 18 écarts relevés en v0.1 ont été traités : **14 sont résolus** dans le code et **4 sont des écarts maintenus**, justifiés ci-dessous. Ces 4 écarts sont **à valider**. Chaque ligne cite le test qui le prouve.

| # | Écart v0.1 | Traitement v0.2 | Preuve |
|---|---|---|---|
| E1 | Fichiers `constantes.js`, `empreinte.js`, `ordre.json` absents | **Résolu.** Les trois fichiers existent ; `modele.js` est supprimé | `architecture.test.js` : `ordre.json` couvre exactement le cœur, et chaque module ne dépend que de modules chargés avant lui |
| E2 | Format d'empreinte différent du §5 | **Résolu.** `H(nom, valeurs)` et `Coll` exactement comme au §5 ; noms `h_fond`, `h_desc`, `h_let`, `ecriture`, `ligne`, `actif`, `ligne_staging`, `ecriture_classee`, `anomalie`, `decision`, `total_saisi`, `staging`, `objet`, `derogation` ; `hLigne` sur les 36 champs de `CHAMPS_ACTIF` | `scenarios.test.js` : **égalité exacte avec une implémentation Python indépendante** (`scripts/empreintes_reference.py`, écrite d'après le §5) sur les 36 lignes et les 14 écritures de S01 ; vecteur `sha256sum` sur une sérialisation `h_fond` |
| E3 | `Error` au lieu d'`ErreurContrat` | **Résolu.** `Constantes.erreurContrat(code, champ)`, message = code | `architecture.test.js` : aucun `throw new Error` dans le cœur ; message conforme à `/^[A-Z_]+$/` |
| E4 | `executerControles` ne rendait que les anomalies | **Résolu.** Rend `{controles, anomalies, variations}`, avec les variations triées par écart absolu | Test « Restitution » |
| E5 | En-tête lu sans tenir compte de la casse | **Résolu.** Correspondance exacte, sensible à la casse, après `normTexte` (règle « imposer plutôt que deviner ») | Scénarios S01–S11 (en-têtes exacts) |
| E6 | Montants négatifs reclassés | **Résolu par P3.** Le montant reste dans sa colonne | Test « Lecture (P3) » ; S11a, S11e |
| E7 | Montant en devise absent = 0 | **Résolu.** `null` | Test « Lecture (P3) » ; lignes canoniques de S01 |
| E8 | Contrat : une anomalie REJ_LIGNES par motif | **Écart maintenu.** Une seule REJ_LIGNES par import, avec `rangs` et le détail par motif dans `message`. Justification : A2 bloque l'import dès la première ligne rejetée, donc une seule anomalie lisible suffit en revue, et c'est aussi la convention de l'ingénieur | S09, S11b2, S11c |
| E9 | C2 rapproché des lignes retenues | **Écart maintenu.** C2 compare le total saisi aux totaux **du fichier** (lignes normalisées), car le total du logiciel porte sur l'export entier. Il n'est pas exécuté s'il existe des lignes rejetées (REJ_LIGNES bloque déjà ; l'écart serait mécanique) | S11b2, S11c, S11e ; test « Contrôle A6 » |
| E10 | Mouvements `AVANT` et `APRES` | **Résolu.** Un mouvement par (`publication_id`, `ligne_uid`) ; types INSERTION, MODIFICATION, LETTRAGE, SUPPRESSION_LOGIQUE, RETRAIT_LIGNE, ANNULATION ; `image_avant` complète ; `h_avant` / `h_apres` ; `mouvement_id` sur 6 chiffres | Tests « Retour arrière » ; propriétés « annuler(publier(B)) = B » ; REC_PUBLICATION (a), (b) et (c) vérifiés avant `ok` |
| E11 | Codes de refus propres au prototype | **Résolu.** Codes `PUB_*` / `ANN_*` du §4.9 et du §7, rendus triés et cumulés. Trois codes ajoutés : `PUB_ACQUITTEMENT_INVALIDE`, `PUB_ABSENTE_CLOTURE_NON_MOTIVEE` (P5), `PUB_REIMPORT` | Test « Publication (T15) » |
| E12 | `PUB_IMPORT_EN_COURS`, `ANN_IMPORT_EN_COURS`, `valide_le < soumis_le`, `tampon_inactif` absents | **Résolu.** Les quatre sont implémentés. L'information « import en cours » est **fournie par l'appelant** (la machine à états `IMPORTS` relève de l'étape Apps Script) | Tests « Publication (T15) », « Retour arrière », « Validation » |
| E13 | Décisions simplifiées | **Résolu.** `DecisionAbsente`, `DecisionDerogation`, `DecisionAcquittement` typées ; `Validation` conforme au §3 ; `appliquerDecisions` ; acquittement sans joker | Test « Décisions » |
| E14 | Champs d'anomalie incomplets | **Résolu.** `anomalie_id`, `nb`, `rangs`, `cles`, `mention`, `statut`, `control_version`, `empreinte_objet`, `empreinte_derogation`. Les statuts sont appliqués sur des **copies** par `appliquerDecisions` | Tests « Décisions » et « Non-mutation » |
| E15 | P5 ouvert | **Résolu par P5** (§12) | Test « Exercice clôturé (P5) » |
| E16 | P4 ouvert | **Résolu par P4.** `IDN_REAPPARITION` (I) agrégé, et mouvement portant le sous-type `REACTIVATION` | Test « Réapparition (P4) » |
| E17 | Vérification du Hasher et immutabilité non testées | **Résolu.** `Empreinte.verifierHasher` (vecteur `abc` et vecteur non ASCII calculés hors Node) à chaque cas d'usage ; test de non-mutation sur entrées **gelées en profondeur**, sur 60 cycles complets | Tests « Hasher » et « Non-mutation » |
| E18 | Rangs des attendus en numéros d'enregistrement | **Résolu.** Les attendus sont convertis en numéros de ligne physique (+1, champ `convention_rang`) ; le générateur est aligné et la régénération est identique à l'octet près | `verifier_fixtures.py` : TOUT CONFORME ; 22 scénarios |

**Écarts maintenus restants, à valider** :
- E8 : une seule anomalie de rejet par import.
- E9 : le total saisi est rapproché des totaux du fichier, et seulement en l'absence de rejets.
- `reconduireDerogations` se limite aux dérogations retenues par la **dernière publication appliquée de type PUBLICATION**. Après une annulation, rien n'est reconduit (repli sûr).
- `verifierEncodage` rend la liste des motifs (`CARACTERE_REMPLACEMENT`, `DOUBLE_ENCODAGE`) au lieu de `{ok, texte, motif}`. Le retrait du BOM est fait par `parseCsv`.

## 12. Amendements v0.2 (arbitrages du dirigeant du 2026-10-09)

Les règles ci-dessous **remplacent** celles des sections indiquées.

| Point | Décision | Sections amendées | Règle appliquée |
|---|---|---|---|
| P1 | Périmètre de dérogation limité à l'exercice, identité de l'anomalie et contexte strictement vérifiés | §5.5 | `perimetre_anomalie` = `exercice_id` pour ECRITURE et COMPTE ; `exercice_id\|du\|au` pour FICHIER, EXERCICE et ACTIF. L'empreinte de dérogation inclut le code, la gravité, l'objet, `empreinte_objet` (contenu base et fichier de l'écriture), le statut de l'exercice, le profil et sa version, et `version_regles` (`regles_v2`). Reconduction seulement si l'égalité est stricte |
| P2 | Total du grand livre obligatoire par défaut, avec dérogation exceptionnelle motivée | §6.2 (C3) | `REC_TOTAL_SAISI` (B, objet `TOTAL_ABSENT`), dérogeable avec un motif d'au moins 20 caractères. **Jamais reconduit** (`reconductible: false`) : la dérogation doit être renouvelée à chaque import |
| P3 | Valeur d'origine des montants négatifs conservée, sans reclassement automatique, tant qu'un expert-comptable ne l'a pas validé | §4.5 (5) | `debit_cts` / `credit_cts` gardent la valeur signée de leur colonne ; `montant_cts = debit_cts − credit_cts` ; `MNT_NEG` (I) avec les rangs. Le contrôle indépendant C5 applique la même règle. Le fond comptable d'un grand livre et celui d'un FEC se comparent sur le montant signé |
| P4 | Code de réapparition informatif et traçable | §4.9, §6.1 | `IDN_REAPPARITION` (I, agrégé, `cles`) ; mouvements de l'écriture portant `sous_types` ⊇ `REACTIVATION`, avec `image_avant` au statut `SUPPRIMEE_SOURCE` |
| P5 | Validation explicite renforcée pour une écriture absente sur exercice clôturé, sans doublonner les validations | §6.1, §7 | Sur un exercice clôturé, une ABSENTE produit **une seule** anomalie `IDN_ABSENTE` (B, mention `EXERCICE_CLOTURE`) et **pas** de PER_CLOTURE. Elle est levée par la **seule décision ABSENTE**, qui doit alors porter un motif d'au moins 20 caractères et son auteur. Aucune dérogation séparée. À défaut : refus `PUB_ABSENTE_CLOTURE_NON_MOTIVEE` |
| P6 | Ne pas rejeter un FEC sur le seul nom ; vérifier l'identité avec les métadonnées et informations fiables disponibles | §4.5 (3), §6.1 | Contrôle **avant toute lecture et avant la détection de réimport**. Sources : dossier de dépôt (fourni par l'adaptateur), SIREN déclaré par l'opérateur, SIREN du nom FEC. **Une source qui désigne un autre client → `CLI_MISMATCH` (BND)**. Aucune confirmation par le dossier ou la déclaration → `CLI_IDENTITE_NON_CONFIRMEE` (B, motivée) ; le nom du fichier seul ne suffit pas à confirmer. Nom FEC non conforme → `CLI_NOM_FEC_NON_CONFORME` (A) |
| P7 | Décimales supplémentaires nulles acceptées après validation stricte du format, sans arrondi | §4.1 | Au-delà de 2 décimales, les chiffres supplémentaires doivent **tous** valoir 0 (`1,230` → 123), sinon `PRECISION`. Jamais d'arrondi. Information `MNT_DECIMALES_NULLES` (I) avec les rangs. Le format reste strict : séparateur de milliers par groupes de 3, au plus un marqueur négatif |

Autres précisions apportées par v0.2 :
- débit et crédit vides ensemble → rejet `CHP_VIDE` (§4.5) ;
- la décision ABSENTE doit avoir un motif non vide et un auteur ;
- le type de source d'un exercice (A4) est dérivé de l'actif (`source_type`), comme prévu au §6.1.
