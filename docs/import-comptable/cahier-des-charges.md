# Cahier des charges — Outil d'import comptable incrémental (V1 Google Sheets / Apps Script)

| | |
|---|---|
| Statut | **Partie A (cible)** : orientation validée par le dirigeant (D1–D8) · **Partie B (MVP)** : proposée, à valider — aucun développement engagé |
| Version | 0.2 — 2026-10-09 (0.1 : cible initiale ; 0.2 : décisions D1–D8, périmètre MVP, planning) |
| Contributeurs | `directeur-operations` (organisation, workflow, plan), `architecte` (topologie, onglets, flux, code), `ingenieur-outils-financiers` (modèle, règles d'identification, contrôles, tests) |
| Existant | Dépôt vide hors définitions d'agents : tout ce document est une **proposition** |

Conventions : **[H]** hypothèse à confirmer sur des exports réels anonymisés · **[P]** proposition à arbitrer · **[V-EC]** règle comptable à faire valider par un professionnel habilité · **[À VÉRIFIER]** limite technique citée de mémoire, à confirmer sur la documentation Google en vigueur.

---

## Sommaire

1. [Cadrage](#1-cadrage)
2. [Architecture générale](#2-architecture-générale)
3. [Onglets et fonctionnement](#3-onglets-et-fonctionnement)
4. [Flux d'un import et validation](#4-flux-dun-import-et-validation)
5. [Modèle canonique et normalisation](#5-modèle-canonique-et-normalisation)
6. [Règles d'identification des écritures](#6-règles-didentification-des-écritures)
7. [Contrôles et tableau des anomalies](#7-contrôles-et-tableau-des-anomalies)
8. [Stratégie de tests](#8-stratégie-de-tests)
9. [Plan de développement par lots](#9-plan-de-développement-par-lots)
10. [Risques](#10-risques)
11. [Décisions à trancher avant programmation](#11-décisions-à-trancher-avant-programmation)

**Partie B — MVP (premier prototype)**

12. [Principes du MVP](#12-principes-du-mvp)
13. [Architecture technique MVP](#13-architecture-technique-mvp)
14. [Onglets MVP](#14-onglets-mvp)
15. [États, idempotence, reprise](#15-états-idempotence-reprise)
16. [Règles fonctionnelles MVP](#16-règles-fonctionnelles-mvp)
17. [Contrôles essentiels MVP](#17-contrôles-essentiels-mvp)
18. [Validation, publication, retour arrière MVP](#18-validation-publication-retour-arrière-mvp)
19. [Sécurité et isolation non négociables](#19-sécurité-et-isolation-non-négociables)
20. [Spikes techniques](#20-spikes-techniques)
21. [Tests et critères d'acceptation MVP](#21-tests-et-critères-dacceptation-mvp)
22. [Livrables, lots, estimations et critères go/no-go](#22-livrables-lots-estimations-et-critères-gono-go)
23. [Planning](#23-planning)
24. [Fonctionnalités reportées](#24-fonctionnalités-reportées)
25. [Arbitrages restant à faire](#25-arbitrages-restant-à-faire)

> La **partie A** décrit l'architecture **cible**, qui reste la référence à long terme. La **partie B** définit le **MVP** : un sous-ensemble réalisable en Google Sheets + Apps Script. En cas de divergence, la partie B fait foi pour le premier prototype.

---

## 1. Cadrage

### 1.1 Objectif

Importer régulièrement le grand livre (CSV / FEC) de chaque client **sans créer de doublons**, en identifiant à chaque import les écritures nouvelles, modifiées, disparues, renumérotées et en double ; conserver les fichiers bruts ; tracer l'historique ; ne mettre à jour les **données actives** qu'après contrôle et validation humaine. La V1 doit préparer le remplacement par une application connectée par API aux logiciels comptables.

### 1.2 Périmètre V1

| Inclus | Exclu (V2 ou autres modules) |
|---|---|
| Import CSV de grand livre / FEC, formats paramétrés par profil (client × logiciel × type d'export) | Connexions API aux logiciels comptables |
| Normalisation : encodage, séparateurs, dates, montants, sens, comptes | Saisie, révision, lettrage ou correction de la comptabilité |
| Archivage immuable du fichier brut + empreinte SHA-256 | Tableaux de bord, SIG, trésorerie, mapping comptes → SIG |
| Classification : nouvelle, inchangée, modifiée, absente, renumérotée, doublon, collision | Portail client, dépôt de fichiers par le client |
| Contrôles d'équilibre, de réconciliation, de période, de comptes, de volume | Import de balances, relevés bancaires |
| Tableau des anomalies (gravité, statut, commentaire, dérogation) | Droits fins par utilisateur au-delà de Google Drive |
| Staging → validation → publication atomique, retour arrière du dernier import | Publication partielle |
| Journal des imports, des validations et des publications | |
| Un classeur et un dossier Drive par client, créés depuis un gabarit unique | |

### 1.3 Hypothèses

- **H1** Chaque import couvre un **périmètre déclaré** (exercice, période, journaux). Sans cela, impossible de distinguer une écriture supprimée d'une écriture hors période.
- **H2** Les exports contiennent au minimum journal, n° d'écriture ou de pièce, date, compte, libellé, débit/crédit ; idéalement lettrage et date de validation (FEC).
- **H3** Volumétrie TPE/PME : 5 000 à 100 000 lignes par exercice ; exports souvent **cumulatifs** (exercice entier ré-exporté chaque mois).
- **H4** Les classeurs sont réservés au cabinet ; le client final n'y accède pas en V1.
- **H5** Compte Google Workspace au nom du cabinet (à décider, D3).

### 1.4 Principe directeur

> Le CSV n'est qu'**un connecteur parmi d'autres**. Les règles (normalisation, identification, contrôles, publication) s'appliquent à un **modèle canonique indépendant de la source** et sont codées en JavaScript pur, testable hors Google. C'est ce qui permettra de remplacer Sheets/Apps Script par l'application cible sans réécrire les règles métier.

### 1.5 Limites réglementaires

L'outil est une **copie d'analyse**, pas la comptabilité. Il signale les anomalies ; les corrections se font dans le logiciel source par le client ou son expert-comptable. À formaliser dans la lettre de mission (D13). Les libellés pouvant contenir des données personnelles (tiers, salariés) : registre RGPD, DPA, durée de conservation (D11).

---

## 2. Architecture générale

### 2.1 Topologie multi-clients [P]

| Option | Verdict |
|---|---|
| A. Classeur unique tous clients | **Rejetée** : données mélangées, 10 M cellules partagées, un partage erroné expose tout |
| B. Classeur par client avec script copié | Rejetée : versions de code divergentes, maintenance ×N |
| C. Classeur par client + script lié léger appelant une **bibliothèque** partagée versionnée | Acceptable — à retenir si les collaborateurs doivent lancer l'import depuis le classeur client |
| **D. Classeur par client sans aucun code + moteur central dans une CONSOLE** | **Recommandée** : une seule version de code, aucun code copié chez les clients, moindre privilège, préfigure l'application cible (un moteur, N espaces de données) |

> Arbitrage entre agents : le directeur des opérations évoquait une bibliothèque (option C) ; l'architecte recommande D. Les deux garantissent un code unique ; D est retenue par défaut car elle évite tout code dans les classeurs clients. Décision D2.

**Organisation Drive**

```
/Pilotage/_Systeme/              CONSOLE (moteur Apps Script, registre clients, profils gabarits), documentation
/Pilotage/Clients/<CLIENT_ID>/   (idéalement un Drive partagé par client en Workspace)
    01_Depot/                    dépôt des CSV — seule zone en écriture pour l'opérateur
    02_Archive_Brute/            fichiers d'origine renommés <import_id>_<sha256-8>_<nom>, en lecture seule
    03_Rejets/                   fichiers refusés (format, doublon, mauvais client)
    <CLIENT_ID>_Compta           classeur de données (aucun code, aucune formule inter-classeurs)
    <CLIENT_ID>_Archive_<AAAA>   archives des exercices clos (si besoin de place)
```

- **Compte technique propriétaire** des classeurs et exécutant du moteur, distinct des comptes nominatifs (D4).
- Code source dans Git, déployé par `clasp` vers un projet de **test** puis de **production** sur version taguée ; jamais d'édition dans l'éditeur en ligne.
- Aucun identifiant de classeur client ni secret dans le dépôt.

### 2.2 Limites Google et réponses [À VÉRIFIER]

| Limite | Impact | Réponse |
|---|---|---|
| 10 M cellules / classeur | Plafond par client ; un export cumulatif stocké tel quel sature en quelques mois | Brut intégral conservé **dans Drive** ; dans Sheets, `RAW_LIGNES` dédoublonné (1 cellule par ligne d'origine) ; indicateur d'occupation, alerte à 60 % ; archivage par exercice |
| 6 min / exécution | Gros fichiers interrompus | Traitement par lots, point de reprise persistant, relance par déclencheur ponctuel (budget ≈ 4 min 30) |
| Temps de déclencheurs cumulé / jour (≈ 90 min grand public, ≈ 6 h Workspace) | Nombre d'imports par jour | Un seul déclencheur de relance actif à la fois |
| Exécutions simultanées | Collisions | `LockService` + verrou logique par client |
| Taille de blob / mémoire | Très gros FEC | Découpage ; refus explicite au-delà d'un seuil mesuré |
| `Session.getActiveUser()` limité hors Workspace | Traçabilité du valideur | Workspace recommandé, sinon saisie confirmée de l'identité |

**Ordre de grandeur** : 100 000 lignes × ~35 colonnes ≈ 3,5 M cellules pour l'actif seul. Doubler l'actif pour le retour arrière (`__PREV`) approcherait la limite → le retour arrière par reconstruction depuis l'historique est recommandé (D8).

### 2.3 Découpage du code (pour mémoire — non développé)

```
src/
  core/       JS pur, aucune API Google, testé sous Node
    model/      schéma canonique, schema_version, validateurs
    csv/        parseur CSV (RFC 4180, dialectes) sur chaîne décodée
    normalize/  dates, montants en centimes, comptes, neutralisation des formules
    identity/   cle_ecriture, ligne_uid, empreintes (hachage via port injecté)
    diff/       appariement et classification dans un périmètre → ChangeSet
    controls/   catalogue de contrôles versionnés → ControlResult[], Anomaly[]
    publish/    plan de publication (nouvel actif, historique, mouvements, checksum)
    workflow/   machine à états et transitions autorisées
  ports/      SourceConnector, RawArchive, Repositories, Hasher, Clock, Lock, Logger, BudgetTimer
  adapters/gas/  implémentations Apps Script (Drive, Sheets, computeDigest, LockService, triggers)
  app/        cas d'usage : startImport, continueImport, runControls, submitValidation, publish, rollback
  ui/         menu CONSOLE, choix du client, dialogues de revue et de validation
tests/        tests Node sur core/, jeux fictifs, doublures des ports
```

- Règle de dépendance : `core` ne dépend de rien ; un test interdit tout appel `SpreadsheetApp` / `DriveApp` / `Utilities` dans `core`.
- Demain : `ApiConnector(<logiciel>)` produit le même `RawDocument` que `CsvFileConnector` ; le JSON brut est archivé, la suite est inchangée. Les onglets ont exactement le schéma des futures tables SQL → reprise d'historique par export.

### 2.4 Versionnement et traçabilité

| Objet | Versionnement |
|---|---|
| Schéma du classeur | `schema_version` (semver) dans `_META` ; migrations idempotentes testées sur copie fictive ; le moteur refuse un schéma inattendu |
| Profils d'import | Append-only dans `PROFIL_SOURCE`, cycle brouillon → validé → actif ; jamais rétroactif sans ré-import explicite |
| Règles de normalisation et d'empreinte | Préfixe de version (`norm_v1`, `v1:` dans les empreintes) ; changement = migration + non-régression |
| Contrôles | `control_id` + `control_version` enregistrés à chaque exécution |
| Outil | `tool_version` = tag Git = version déployée, inscrit dans chaque import et publication |

**Chaîne de traçabilité d'une ligne active** :
`ECRITURES_ACTIVES.ligne_uid` → `IMPORTS` (fichier, sha256, profil, version outil) → `raw_hash` → `RAW_LIGNES.raw_text` → fichier archivé dans Drive (sha256 revérifiable, n° de ligne source) → `PUBLICATIONS` → `VALIDATIONS` (qui, quand, dérogations) → `ECRITURES_HISTO` / `MOUVEMENTS` (versions antérieures).

---

## 3. Onglets et fonctionnement

### 3.1 Règles communes

- Ligne 1 = noms de champs canoniques en `snake_case` ; aucune donnée sous un autre en-tête.
- Colonnes texte au format texte brut **avant** écriture (préserve les zéros de tête des comptes, évite la réinterprétation des dates).
- Montants en **centimes entiers** ; dates en texte ISO `AAAA-MM-JJ`.
- Tous les onglets sont protégés ; l'humain n'agit que par les dialogues de la CONSOLE (sauf statut/commentaire d'anomalie si D2 = option C).
- Interdiction de `IMPORTRANGE` ou de toute référence à un autre classeur (contrôle automatique).

### 3.2 Classeur CONSOLE (cabinet, sans données comptables)

| Onglet | Rôle |
|---|---|
| `CLIENTS` | Registre : client_id, nom court, SIREN, spreadsheet_id, folder_ids, statut, schema_version, exercices et statut OUVERT/CLÔTURÉ |
| `CATALOGUE_PROFILS` | Gabarits de profils par logiciel (FEC, Sage, Cegid, EBP, Quadra, Pennylane…) |
| `RELEASES` | Versions de l'outil déployées |
| `RUNS` | Journal technique : identifiants, compteurs, durées — **jamais** de libellé ni de montant |

### 3.3 Classeur client `<CLIENT_ID>_Compta`

| Couche | Onglet | Rôle | Colonnes principales | Écrit par | Mutabilité |
|---|---|---|---|---|---|
| Config | `_META` | Identité et versions | client_id, siren, schema_version, tool_version, profil actif, longueur de compte `L`, exercices | Script (migration) | Modifié seulement par migration |
| Config | `PROFIL_SOURCE` | Paramétrage de l'export du client | profil_id, version, valid_from, encodage, séparateur, format date/montant, mode de sens, mapping colonne source → champ canonique, lignes parasites, portée de numérotation, niveau de clé K1–K4, statut, validé_par/le | Humain via dialogue, activation par script | Append-only |
| Config | `REFERENTIELS` | Plan de comptes, journaux, table auxiliaire → collectif | compte, libellé, classe, actif ; journal, libellé ; aux, collectif | Humain via dialogue | Versionné |
| Brut | `RAW_LIGNES` | Lignes d'origine dédoublonnées (le fichier Drive reste la référence) | raw_hash, raw_text (1 cellule), first_import_id, first_line_no | Script | Append-only, jamais modifié |
| Traitement | `IMPORTS` | Journal des imports + machine à états | import_id, fichier, file_id_drive, file_sha256, taille, encodage, **périmètre** (exercice, du, au, journaux), compteurs (lues, rejetées, parasites, nouvelles, modifiées, absentes, renumérotées, doublons, inchangées), totaux D/C fichier, statut, cursor, lease_owner/expiry, profil_version, tool_version, created_by/at | Script | 1 ligne / import ; seuls statut, cursor, lease évoluent |
| Traitement | `IMPORT_EVENTS` | Transitions d'état et erreurs | event_id, import_id, horodatage, de → vers, étape, message (sans données), execution_id | Script | Append-only |
| Traitement | `STAGING` | Lignes normalisées de l'import en cours et leur diagnostic | champs canoniques (§5) + import_id, rang_source, raw_hash, cle_ecriture, ligne_uid proposé, empreintes, statut de classification, sous-types de modification, nb_anomalies | Script | Recalculé, vidé à l'import suivant |
| Traitement | `STAGING_ABSENTES` | Écritures actives absentes du fichier **dans le périmètre** | ligne_uid, cle_ecriture, motif, décision (accepter / reporter) | Script + décision via dialogue | Recalculé |
| Contrôle | `CONTROLES` | Résultat de chaque contrôle par import | import_id, control_id, version, attendu, obtenu, écart, OK/KO, gravité | Script | Append-only |
| Contrôle | `ANOMALIES` | **Tableau de contrôle des anomalies** | anomalie_id, import_id, code, gravité, objet, clé, constaté, attendu, écart, statut (OUVERTE / EN_COURS / RÉSOLUE / DÉROGÉE), commentaire, traité_par/le | Script crée ; humain change statut et commentaire | Création append-only ; changements tracés dans `ANOMALIES_HISTO` |
| Contrôle | `VALIDATIONS` | Décisions humaines | validation_id, import_id, décision (VALIDÉ / REJETÉ), dérogations (codes + objets + motifs), check-list, validé_par/le, **empreinte du staging validé** | Script sur action humaine | Append-only |
| Actif | `ECRITURES_ACTIVES` | Référentiel publié — **unique source des modules aval** | champs canoniques + ligne_uid, version, statut (ACTIVE / SUPPRIMEE_SOURCE), first_seen_import, last_seen_import, last_publication_id, raw_hash | Script (publication) | Reconstruit hors ligne puis basculé |
| Actif | `ECRITURES_HISTO` | Versions antérieures des lignes modifiées ou supprimées | ligne_uid, version, champs canoniques, valide_depuis_pub, valide_jusqu_pub, motif | Script | Append-only |
| Actif | `MOUVEMENTS` | Différences publiées ligne à ligne | change_id, publication_id, import_id, ligne_uid, type, hash_avant, hash_après, sous-types | Script | Append-only |
| Actif | `PUBLICATIONS` | Registre des publications | publication_id, import_id, validation_id, publication précédente, nb lignes, Σ D, Σ C, checksum de l'actif, soldes par compte avant/après (ou lien), statut, date | Script | Append-only |
| Restitution | `TDB_CONTROLE` | État des imports, anomalies ouvertes par gravité, réconciliations, variations de soldes, occupation des cellules | Formules internes uniquement | Formules | Recalculé |

### 3.4 Fonctionnement du tableau de contrôle `TDB_CONTROLE`

- **Bandeau d'état** : dernier import, statut, date, prochaine action attendue (« 3 bloquants à traiter », « prêt à valider »…).
- **Synthèse de l'import en cours** : compteurs par classification ; réconciliation lues = importées + rejetées + doublons + parasites ; Σ D / Σ C fichier vs staging vs base simulée.
- **Anomalies ouvertes** par gravité et par code, avec lien vers la ligne de `ANOMALIES`.
- **Variations de soldes par compte** (avant → après simulé), triées par écart absolu.
- **Santé du classeur** : occupation des cellules, checksum de l'actif conforme au dernier `PUBLICATIONS`.

---

## 4. Flux d'un import et validation

### 4.1 Rôles

| Rôle | V1 | Responsabilités |
|---|---|---|
| Client / expert-comptable | Externe | Fournit l'export du périmètre demandé ; répond aux questions ; corrige dans son logiciel |
| Préparateur | Collaborateur (au départ le dirigeant) | Dépose, lance, analyse, commente, acquitte les avertissements, propose go / no-go |
| Valideur | Dirigeant | Valide les dérogations, absences et modifications sur exercice clôturé, suppressions massives ; publie |
| Administrateur | Dirigeant puis ingénieur outils | Création des clients, profils, versions, droits |

Préparateur = valideur tant que le cabinet est seul : check-list obligatoire, validation à un autre moment que la préparation, signalée dans le journal.

### 4.2 Étapes

| # | Étape | Description | Statut `IMPORTS` |
|---|---|---|---|
| 1 | Réception | Fichier dans `01_Depot` ; vérification triple du client : dossier parent, `_META.client_id`, SIREN du nom de fichier FEC = registre. Échec → `03_Rejets` | `REÇU` / `REJETÉ` |
| 2 | Empreinte | SHA-256 du fichier ; déjà publié → no-op journalisé `REIMPORT_FICHIER` | |
| 3 | Archivage | Déplacement vers `02_Archive_Brute`, renommage, lecture seule | `ARCHIVÉ` |
| 4 | Déclaration du périmètre | Exercice, du/au, journaux (par défaut : bornes du fichier, avec avertissement) | |
| 5 | Lecture + normalisation | Par lots : décodage, profil imposé (jamais deviné en silence), normalisation, empreintes, clés ; écriture `RAW_LIGNES` + `STAGING` | `NORMALISATION_EN_COURS` → `NORMALISÉ` |
| 6 | Comparaison | Appariement et classification vs actif, **limitée au périmètre** | `COMPARÉ` |
| 7 | Contrôles | Catalogue §7 ; création des anomalies ; simulation de la base après fusion | `CONTRÔLÉ` |
| 8 | Revue | Préparateur : commentaires, acquittements, décisions sur absentes / doublons inter / rapprochements | `PRÊT_À_VALIDER` |
| 9 | Validation | Valideur : go / no-go, dérogations motivées ; empreinte du staging figée | `VALIDÉ` / `REJETÉ` |
| 10 | Publication | Reconstruction dans `ECRITURES_ACTIVES__NEXT`, écritures `HISTO` et `MOUVEMENTS`, contrôle du checksum, **bascule** | `PUBLICATION_EN_COURS` → `PUBLIÉ` |
| 11 | Journal | `PUBLICATIONS`, `RUNS` ; liste de questions client (brouillon, envoyée par le dirigeant) | |

Statuts de sortie : `REJETÉ`, `ÉCHEC_<étape>`, `REMPLACÉ` (import non publié supplanté par un fichier plus récent). Toute transition non prévue lève une erreur.

### 4.3 Garanties techniques

- **Idempotence** : unicité de `file_sha256` par client ; lots identifiés `(import_id, n° de lot)`, tronqués après le dernier lot validé avant réécriture ; publication liée à une validation, refusée si l'empreinte du staging a changé depuis.
- **Verrouillage** : `LockService.getScriptLock()` par exécution + verrou logique par client (`lease_owner`, `lease_expiry`) ; un seul import non terminal par client.
- **Reprise** : point de reprise (étape + ligne) persisté après chaque lot dans `IMPORTS` ; relance automatique ou manuelle depuis ce point.
- **Actif jamais modifié sur place** : une panne en publication laisse l'actif précédent intact.
- **Contrôle d'intégrité** : checksum de l'actif recalculé au début de chaque import ; écart avec `PUBLICATIONS` = anomalie bloquante (altération manuelle).

### 4.4 Règles de validation (go / no-go)

**Conditions de go (toutes requises)**

1. Aucun bloquant **non dérogeable** (BND) ouvert.
2. Tout autre bloquant résolu (profil corrigé, réimport, correction à la source) ou **dérogé** par le dirigeant.
3. Tout avertissement acquitté (nom, date).
4. Chaque ABSENTE, DOUBLON_INTER et RAPPROCHEMENT_PROBABLE a une décision explicite.
5. Import le plus récent pour son périmètre, aucun autre import du client en attente.
6. Check-list de validation signée ; variation de volume et de totaux expliquée.

**Dérogation** : code + objet précis (jamais « tout »), motif rédigé (≥ 20 caractères), référence éventuelle, valideur, horodatage. Portée limitée à **cet import** ; jamais supprimée.

**Publication atomique (tout ou rien)**

| Classification | Effet |
|---|---|
| NOUVELLE | Insertion, version 1 |
| MODIFIÉE | Nouvelle version dans l'actif ; l'ancienne versée dans `ECRITURES_HISTO` |
| RENUMÉROTÉE | Changement de clé, `ligne_uid` et historique conservés |
| ABSENTE acceptée | Statut `SUPPRIMEE_SOURCE` (suppression logique, jamais d'effacement) |
| ABSENTE reportée | Reste ACTIVE, anomalie maintenue OUVERTE |
| Rejets, doublons ignorés | Jamais publiés |

**Retour arrière** : uniquement le **dernier** import publié, par reconstruction depuis `ECRITURES_HISTO` / `MOUVEMENTS` (recommandé) ou réactivation d'un onglet `__PREV` (D8). Critère : checksum de l'actif identique à celui de la publication N-1.

---

## 5. Modèle canonique et normalisation

### 5.1 Granularité

Stockage à la **ligne d'écriture** (comme le FEC) ; l'**écriture** est le regroupement équilibré de lignes partageant une `cle_ecriture`. Montants en centimes entiers, jamais de nombres à virgule.

### 5.2 Champs canoniques (alignés sur les 18 champs du FEC, art. A47 A-1 LPF)

| # | Champ | FEC | Type | Oblig. | Règle |
|---|---|---|---|---|---|
| 1 | `journal_code` | JournalCode | texte, MAJ | O | trim, majuscules |
| 2 | `journal_lib` | JournalLib | texte | O* | *dérivé du référentiel si absent (info CHP_DERIVE) |
| 3 | `ecriture_num` | EcritureNum | texte | O | chaîne conservée telle quelle (« 000123 » ≠ « 123 ») |
| 4 | `ecriture_date` | EcritureDate | date ISO | O | |
| 5 | `compte_num` | CompteNum | texte | O | padding §5.3 |
| 6 | `compte_lib` | CompteLib | texte | O* | dérivé du plan de comptes si absent |
| 7 | `comp_aux_num` | CompAuxNum | texte | F | |
| 8 | `comp_aux_lib` | CompAuxLib | texte | F (O si aux) | |
| 9 | `piece_ref` | PieceRef | texte | O | |
| 10 | `piece_date` | PieceDate | date ISO | O | |
| 11 | `ecriture_lib` | EcritureLib | texte | O | |
| 12 | `debit_cts` | Debit | entier ≥ 0 | O | dérivé si Montant + Sens |
| 13 | `credit_cts` | Credit | entier ≥ 0 | O | idem |
| 14 | `ecriture_let` | EcritureLet | texte | F | casse conservée [H] |
| 15 | `date_let` | DateLet | date ISO | F | |
| 16 | `valid_date` | ValidDate | date ISO | O (FEC) / F | vide = brouillard |
| 17 | `montant_devise_cts` | Montantdevise | entier | F | même signe que `montant_cts` |
| 18 | `idevise` | Idevise | ISO 4217 | F | obligatoire si montant devise, et inversement |

**Champs techniques** : `client_id`, `exercice_id`, `montant_cts` (= débit − crédit), `sens`, `compte_num_source`, `comp_aux_num_source`, `import_id`, `rang_source`, `raw_hash`, `cle_ecriture`, `ligne_uid`, empreintes (§6.2), `version`, `statut`.

### 5.3 Règles de normalisation (fonctions pures versionnées `norm_v1`)

| Sujet | Règle |
|---|---|
| Encodage | Imposé par le profil ; sinon UTF-8 (BOM retiré), repli Windows-1252/ISO-8859-15 si U+FFFD ; double encodage (`Ã©`…) → bloquant ; normalisation Unicode NFC |
| Séparateur | Imposé par le profil ; sinon détection TAB, `\|`, `;`, `,` sur nombre de colonnes constant ; guillemets RFC 4180 ; ligne au mauvais nombre de colonnes rejetée |
| Lignes parasites | Motifs du profil (totaux, reports, pieds de page) ; ignorées **et comptées** |
| Dates | Format imposé par le profil (`AAAAMMJJ`, `JJ/MM/AAAA`, `JJ/MM/AA` pivot 20AA, ISO, numéro de série) ; aucune devinette JJ/MM vs MM/JJ ; date calendaire valide ; stockage ISO sans heure |
| Montants | Parsing de la **chaîne** : retrait des espaces (dont U+00A0, U+202F) ; négatif si `-` en tête/fin ou parenthèses ; séparateur décimal du profil ; ≤ 2 décimales ; conversion en centimes. `"1 234,56"` → 123456 ; `"(1.234,56)"` → −123456 ; `"1234,5"` → 123450 |
| Sens | Mode A débit/crédit, B montant + sens, C montant signé (+ = débit par défaut). D et C non nuls sur une ligne → rejet. Montant négatif : signe conservé, D/C recalculés, info [V-EC] |
| Texte | Trim, espaces multiples réduits, caractères de contrôle retirés ; majuscules pour journal, compte, auxiliaire, devise ; libellés en casse d'origine |
| Neutralisation | Toute valeur commençant par `=`, `+`, `-`, `@` (hors montants parsés) est neutralisée avant écriture dans Sheets — comportement exact de `setValues` à vérifier par test |
| Comptes | Retrait espaces/points/tirets ; **padding à droite par 0** jusqu'à la longueur `L` du client (`6061` → `60610000`) ; jamais de troncature (trop long → rejet) ; collision de padding (`4011` et `40110`) → bloquant ; scission collectif/auxiliaire selon règle du profil (`401DUPONT`) [H] |
| Libellés pour empreinte | NFC → majuscules → sans accents → espaces réduits |
| Lettrage | Trim ; vide / `null` / `"0"` = vide si le profil le déclare |

### 5.4 Profil d'import

Un profil (client × logiciel × type d'export, versionné) définit : paramètres de lecture, mapping colonnes source → canonique (avec valeur par défaut / dérivation), lignes parasites, mode de sens, longueur `L`, **portée de numérotation** des écritures et **niveau de clé** (K1–K4). Une colonne inconnue ou manquante bloque l'import.

> **Recommandation forte** : utiliser le **FEC comme source de référence** (D1). Les grands livres triés par compte n'ont souvent ni numéro d'écriture ni date de validation : regroupement par écriture et contrôle d'équilibre impossibles, clé dégradée en K3/K4.

---

## 6. Règles d'identification des écritures

### 6.1 Deux notions distinctes

- **Clé d'identité** — « qui est-ce ? » : stable dans le temps, ne change pas quand le contenu est corrigé.
- **Empreinte de contenu** — « que contient-elle ? » : change dès qu'un champ significatif change.

Le rang physique dans le fichier n'est **jamais** une identité.

### 6.2 Clé d'écriture

`cle_ecriture = client_id | portée | journal_code | ecriture_num`

Portée selon la numérotation du logiciel (paramètre du profil) : `GLOBAL` (rien), `EXERCICE` (`exercice_id`), `JOURNAL_MOIS` (`AAAA-MM`). **La date n'entre pas dans la clé** lorsque le numéro suffit : une date corrigée reste la même écriture (MODIFIÉE `M_DATE`).

**Niveaux de qualité de clé** (déclarés dans le profil, affichés dans chaque rapport) :

| Niveau | Source | Clé | Fiabilité |
|---|---|---|---|
| K1 | ID de ligne natif stable (API, certains exports) | `client_id \| id_ligne_source` | Maximale |
| K2 | N° d'écriture stable (FEC) | `cle_ecriture` + appariement des lignes | Bonne — cas standard |
| K3 | Pas de numéro, pièce présente | `client \| journal \| ecriture_date \| piece_ref` | Moyenne — deux écritures même pièce même jour fusionnent (contrôle IDN_K3_AMBIGU) |
| K4 | Ni numéro ni pièce | `client \| journal \| date \| h_ecr_contenu \| n° d'occurrence` | Faible — une modification apparaît comme absente + nouvelle, rapprochées par suggestion |

**Identifiant interne de ligne** : `ligne_uid = cle_ecriture # k`, rang `k` attribué à la première apparition puis **conservé** par appariement.

`client_id` fait partie de toutes les clés : aucune collision possible entre clients, même sur fichier identique.

### 6.3 Empreintes (SHA-256)

Sérialisation canonique : champs dans un ordre fixe séparés par U+001F, absent = `""`, montants en centimes, dates ISO, préfixe de version `v1:`.

| Empreinte | Champs | Usage |
|---|---|---|
| `h_fond` | compte_num, comp_aux_num, montant_cts, idevise, montant_devise_cts | Fond comptable de la ligne |
| `h_desc` | ecriture_lib normalisé, piece_ref, piece_date, compte_lib, comp_aux_lib | Descriptif |
| `h_let` | ecriture_let, date_let | Lettrage (champ « de suivi ») |
| `h_valid` | valid_date | Validation |
| `h_ecr_entete` | ecriture_date, journal_lib | En-tête d'écriture |
| `h_ecr_contenu` | journal_code, ecriture_date, liste **triée** des `h_fond` | Renumérotation, doublons inter-imports, K4 |
| `raw_hash` | ligne d'origine décodée | Dédoublonnage du brut |
| `file_sha256` | octets du fichier | Réimport à l'identique |

Ce découpage qualifie **la nature** d'une modification sans comparer champ à champ, et sépare les champs structurants (fond) des champs de suivi (lettrage, validation).

### 6.4 Appariement des lignes d'une même écriture (K2/K3)

Pour une même `cle_ecriture`, lignes de la base B contre lignes du fichier F, en passes successives (une ligne appariée sort des passes suivantes ; égalités départagées par `ligne_uid` croissant côté B et `rang_source` côté F) :

1. `h_fond + h_desc + h_let + h_valid` égaux → ligne inchangée
2. `h_fond` égal → seuls descriptif / lettrage / validation ont changé
3. Même compte, auxiliaire et sens → **montant** modifié
4. Même montant → **compte** modifié
5. Reste : seule côté F = ligne **ajoutée** ; seule côté B = ligne **retirée**

Deux lignes identiques dans une même écriture (ex. deux lignes 606 à 50,00 €) sont légitimes et appariées par rang.

### 6.5 Matrice de classification (niveau écriture)

Seules les écritures de B **situées dans le périmètre déclaré** de l'import participent à la comparaison.

| Statut | Condition | Gravité par défaut | Effet à la publication |
|---|---|---|---|
| **REIMPORT_FICHIER** | `file_sha256` déjà publié | Info — import arrêté | Aucun |
| **NOUVELLE** | Clé absente de B (ni renumérotation, ni doublon) | — | Insertion |
| **INCHANGÉE** | Clé dans B, toutes empreintes égales | — | Aucun |
| **MODIFIÉE** | Clé dans B, ≥ 1 empreinte différente. Sous-types cumulables : `M_MNT`, `M_CPT`, `M_AUX`, `M_DATE`, `M_LIGNES`, `M_LIB`, `M_PIECE`, `M_LET`, `M_VALID`, `M_DEV` | Selon §6.6 | Nouvelle version, ancienne historisée |
| **ABSENTE** | Clé dans B et dans le périmètre, absente de F | Avertissement (bloquant si exercice clôturé) | Après décision : `SUPPRIMEE_SOURCE` |
| **RENUMÉROTÉE** | Clé F nouvelle **et** une ABSENTE de B a le même `h_ecr_contenu` (1 pour 1, date la plus proche d'abord) | Info (avertissement si l'ancienne était validée) | Changement de clé, historique conservé |
| **JUMELLE** | Même `h_ecr_contenu` qu'une autre écriture **aussi présente** dans F, clé différente | Info (avertissement si même `piece_ref`) | Insertion normale |
| **DOUBLON_INTRA** | Dans F, même clé en k ≥ 2 blocs disjoints au contenu identique (ou lignes brutes identiques en K1) | Avertissement — un seul bloc conservé | Un bloc publié, les autres comptés « doublons ignorés » |
| **COLLISION** | Dans F, même clé sur des blocs **de contenu différent** (numéro réutilisé, portée mal paramétrée) | **Bloquant non dérogeable** | Aucune — corriger le profil |
| **DOUBLON_INTER** | NOUVELLE dont le `h_ecr_contenu` égale celui d'une écriture de B hors périmètre ou d'un autre profil, original non absent (FEC importé après un grand livre, changement de logiciel) | Avertissement — décision humaine | Selon décision |

### 6.6 Gravité selon le type de modification

| Modification | Écriture non validée | Écriture validée | Exercice clôturé |
|---|---|---|---|
| `M_LET` seule | Info, acceptée automatiquement | Info, auto | Info, auto |
| `M_LIB`, `M_PIECE` | Info | Info | Bloquant |
| `M_VALID` brouillard → validée | Info | — | Bloquant |
| `M_VALID` validée → brouillard | — | Avertissement | Bloquant |
| `M_MNT`, `M_CPT`, `M_AUX`, `M_DATE`, `M_LIGNES`, `M_DEV` | Avertissement | Avertissement renforcé (IDN_MOD_VALIDEE) [V-EC] | Bloquant |

### 6.7 Cas particuliers

- **Chevauchement de périodes** : I1 janvier–mars, I2 mars–juin. Janvier et février sont hors périmètre de I2 → jamais ABSENTE ; seul mars est comparé.
- **Réimport** : bloqué par `file_sha256`. Un fichier ré-exporté au contenu identique (ordre ou fins de ligne différents) doit donner **100 % INCHANGÉE** (propriété d'idempotence).
- **Ordre des imports** : fichier extrait avant le dernier publié → avertissement PER_ORDRE.
- **Renumérotation** : `PROV-17` (brouillard) devient `000051` à la validation → rapprochée par `h_ecr_contenu` ; sans cela, 1 ABSENTE + 1 NOUVELLE fausseraient les soldes.
- **Rapprochement probable** (K3/K4) : une ABSENTE et une NOUVELLE de même journal, même pièce, date ±3 jours, écart de montant ≤ 10 % → suggestion « probablement modifiée », **jamais appliquée automatiquement**.
- **Montants identiques légitimes** : deux loyers de 1 500,00 € le 05/03 avec numéros distincts → 2 NOUVELLE + info JUMEAU. En K4, distingués par rang d'occurrence (`occ1`, `occ2`) ; si le fichier suivant n'en contient plus qu'un, `occ2` est ABSENTE.
- **Lettrage a posteriori** : accepté automatiquement, y compris sur exercice clôturé (facture N-1 réglée en N).
- **Exercice clôturé** : toute NOUVELLE, ABSENTE ou MODIFIÉE (hors `M_LET`) est bloquante.

### 6.8 Exemple chiffré (client fictif CLI-TEST, exercice 2026, K2, portée EXERCICE)

Base après I1 (FEC janvier–mars publié). I2 : FEC janvier–avril, périmètre 01/01–30/04.

| Écriture | Base (I1) | Fichier I2 | Classement |
|---|---|---|---|
| VT 000123 15/01 | 411DUPONT D 1 200,00 / 706000 C 1 000,00 / 445710 C 200,00 | identique | INCHANGÉE |
| AC 000045 10/02 | 607000 D 500,00 / 445660 D 100,00 / 401 C 600,00 | 550,00 / 110,00 / 660,00 | MODIFIÉE `M_MNT` (passe 3) — Δ 607000 +50,00 ; 445660 +10,00 ; 401 −60,00 |
| BQ 000210 20/02 | 411DUPONT C 1 200,00 non lettré | lettrage `AB` 20/02 | MODIFIÉE `M_LET` — info, auto |
| OD 000012 28/02 | 6226 D 300,00 / 4081 C 300,00 | absente | ABSENTE — décision requise |
| AC PROV-17 05/03 | 606100 D 300,00 / 401 C 300,00 | absente ; AC 000051 05/03 identique | RENUMÉROTÉE |
| BQ 000301 et 000302 05/03 | — | 613200 D 1 500,00 / 512 C 1 500,00 (×2) | 2 NOUVELLE + info JUMEAU |
| VT 000124 10/04 | — | 2 blocs disjoints identiques | 1 NOUVELLE + 1 DOUBLON_INTRA ignoré |

Contrôles attendus : lues = importées + rejetées + doublons ignorés + parasites ; Σ des Δ de soldes = 0 ; Δ solde 607000 = +50,00 €.

---

## 7. Contrôles et tableau des anomalies

Gravités : **BND** bloquant non dérogeable · **B** bloquant (dérogeable par le dirigeant) · **A** avertissement à acquitter · **I** info.
Les anomalies portant sur des données actives (ex. compte inconnu) sont **réévaluées à chaque import** et restent ouvertes jusqu'à résolution. Seuils marqués [P] = paramètres par client (D7).

### 7.1 Structure et format

| Code | Contrôle | Gravité | Règle |
|---|---|---|---|
| CLI_MISMATCH | Fichier d'un autre client | BND | dossier, `_META.client_id` ou SIREN ≠ registre ; aucune écriture dans le classeur |
| STR_ENCODAGE | Encodage illisible ou double encodage | BND | U+FFFD après repli, motifs `Ã[\x80-\xBF]` |
| STR_ENTETE | Colonne obligatoire du profil absente ou colonne inconnue | BND | mapping incomplet |
| STR_COLONNES | Nombre de colonnes incorrect | B (ligne rejetée) | ≠ en-tête |
| CHP_OBLIG | Champ obligatoire vide | B (ligne rejetée) | champs « O » §5.2 |
| CHP_FORMAT_DATE / _MNT | Valeur non conforme | B (ligne rejetée) | échec du parseur |
| CHP_DERIVE | Champ obligatoire dérivé d'un référentiel | I | |
| CHP_DEVISE | Devise sans montant devise ou inverse | A | |
| SYS_ACTIF_ALTERE | Checksum de l'actif ≠ dernière publication | BND | altération manuelle |
| SYS_OCCUPATION | Occupation du classeur > 60 % | A | cellules utilisées / 10 M |

### 7.2 Équilibre et réconciliation

| Code | Contrôle | Gravité | Règle |
|---|---|---|---|
| EQU_ECRITURE | Écriture déséquilibrée | B | Σ débit_cts ≠ Σ crédit_cts par `cle_ecriture`, tolérance 0 |
| EQU_JOURNAL_PERIODE | Déséquilibre journal × mois | B | idem par groupe |
| EQU_GLOBAL | Déséquilibre global du fichier | BND (export complet) / A (profil partiel) | Σ D = Σ C |
| EQU_AN | À-nouveaux incohérents | A | journal AN équilibré, sans classe 6/7 ; si N-1 en base : solde AN = solde de clôture N-1 (classes 1 à 5) [V-EC] |
| REC_LIGNES | Comptage incohérent | BND | lues = importées + rejetées + doublons + parasites |
| REC_TOTAUX | Totaux altérés par la normalisation | BND | Σ D, Σ C du brut parsé = normalisés = pied de fichier s'il existe |
| REC_MIROIR | Base simulée ≠ fichier | BND | après fusion simulée, base restreinte au périmètre = fichier : même nombre de lignes, Σ D, Σ C, solde par compte |
| REC_BALANCE | Écart avec une balance fournie | B | solde par compte = balance |

### 7.3 Périodes

| Code | Contrôle | Gravité | Règle |
|---|---|---|---|
| PER_HORS_EXERCICE | Date hors exercice déclaré | B | |
| PER_HORS_PERIMETRE | Date hors périmètre déclaré | A | |
| PER_CLOTURE | Mouvement sur exercice clôturé | B | NOUVELLE / MODIFIÉE hors `M_LET` / ABSENTE |
| SOL_CLOTURE_MODIFIE | Solde modifié sur exercice clôturé | B | Δ ≠ 0 |
| PER_FUTUR | Date postérieure à la date d'import | A | |
| PER_CONTINUITE | Mois sans écriture dans le périmètre | A | |
| PER_ORDRE | Fichier plus ancien que le dernier publié | A | |
| PER_PERIM_DEDUIT | Périmètre déduit, non déclaré | A | |
| PER_DATES_INCOH | Dates incohérentes | I | `valid_date` < `ecriture_date` ; `date_let` < `ecriture_date` ; `piece_date` > `ecriture_date` + 90 j |

### 7.4 Comptes et montants

| Code | Contrôle | Gravité | Règle |
|---|---|---|---|
| CPT_INCONNU | Compte hors plan du client | A (B si classe ∉ 1–8) | |
| CPT_LONGUEUR | Compte plus long que `L` | B | |
| CPT_COLLISION_PADDING | Deux comptes source → un compte normalisé | B | |
| CPT_AUX_ORPHELIN | Auxiliaire sans collectif cohérent | A | table aux → collectif |
| CPT_LIB_DIVERGENT | Libellé ≠ référentiel | I | |
| MNT_NUL | Ligne à zéro | I | compté |
| MNT_DC_DOUBLE | Débit et crédit non nuls | B (ligne rejetée) | |
| MNT_NEG | Montant négatif en colonne D ou C | I | [V-EC] |
| MNT_PRECISION | Plus de 2 décimales | B | |
| MNT_HORS_BORNES | Montant anormal | A | > seuil client (ex. 10 × 99e centile historique du compte) [P] |

### 7.5 Identification et volume

| Code | Contrôle | Gravité | Règle |
|---|---|---|---|
| IDN_COLLISION | Clé réutilisée pour des contenus différents | BND | §6.5 |
| IDN_DOUBLON_INTRA | Doublon dans le fichier | A | |
| IDN_DOUBLON_INTER | Doublon avec un import antérieur | A + décision | |
| IDN_ABSENTE | Écriture absente de la source | A (B si clôturé) + décision | |
| IDN_RENUM | Écriture renumérotée | I | |
| IDN_JUMEAU | Contenu identique, clés distinctes | I (A si même pièce) | |
| IDN_MOD_VALIDEE | Modification de fond d'une écriture validée | A renforcé | |
| IDN_RAPPROCHEMENT_PROBABLE | Suggestion absente ↔ nouvelle | A + décision | |
| IDN_K3_AMBIGU | Clé K3 regroupant plusieurs écritures | A | |
| VOL_VARIATION | Variation de volume par mois commun | A | \|Δ lignes\| / lignes précédentes > 20 % [P], ou toute baisse sur un mois publié |
| VOL_SUPPR_MASSE | Suppressions massives | B | ABSENTE > 5 % des écritures du périmètre ou > 50 [P] — signe d'un mauvais périmètre |
| SOL_VARIATION_COMPTE | Variation de solde par compte | A au-delà du seuil, I sinon | solde après − avant = Σ variations ; liste triée |

### 7.6 Cycle de vie d'une anomalie

`OUVERTE` → `EN_COURS` (commentaire du préparateur) → `RÉSOLUE` (disparue au réimport ou corrigée) ou `DÉROGÉE` (dirigeant, motif). Chaque changement est historisé. Champs : anomalie_id, import_id, code, gravité, objet (fichier / écriture / ligne / compte), clé, constaté, attendu, écart, statut, commentaire, motif, traité_par, date.

---

## 8. Stratégie de tests

Toutes les données de test sont **fictives** (client `CLI-TEST`, sociétés inventées), jamais d'exports réels non anonymisés dans le dépôt.

### 8.1 Jeux de données (résultats attendus écrits **avant** le code)

| Jeu | Contenu | Résultat attendu |
|---|---|---|
| JT01 Nominal | FEC 3 mois, 40 écritures / 120 lignes | 40 NOUVELLE, 0 anomalie B/A, Σ D = Σ C = valeur notée |
| JT02 Réimport | JT01, mêmes octets | REIMPORT_FICHIER, 0 changement |
| JT02b Réexport | JT01 réordonné, CRLF | 40 INCHANGÉE |
| JT03 Montant | AC 000045 500 → 550 | 1 MODIFIÉE `M_MNT`, Δ 607000 = +50,00 |
| JT04 Lettrage | 5 lignes lettrées après coup | 5 `M_LET`, info, publication sans action |
| JT05 Suppression | JT01 sans OD 000012 | 1 ABSENTE, décision requise |
| JT06 Chevauchement | I1 jan–mar puis I2 mar–avr | 0 ABSENTE en jan–fév |
| JT07 Renumérotation | PROV-17 → 000051 | 1 RENUMÉROTÉE, 0 ABSENTE, 0 NOUVELLE |
| JT08 Jumeaux | 2 loyers identiques numérotés, puis variante K4 | 2 NOUVELLE + JUMEAU ; K4 : occ1, occ2 |
| JT09 Doublons | VT 000124 ×2, ligne brute dupliquée | DOUBLON_INTRA ×1 |
| JT10 Collision | même EcritureNum, 2 contenus | IDN_COLLISION, import bloqué |
| JT11 Déséquilibre | écart de 0,01 € | EQU_ECRITURE + EQU_GLOBAL |
| JT12 Encodage | UTF-8, UTF-8 BOM, Windows-1252, double encodage | 3 premiers : empreintes identiques ; 4e : STR_ENCODAGE |
| JT13 Formats | `1 234,56` (NBSP), `(12,00)`, `12,00-`, `JJ/MM/AA`, Montant + Sens | valeurs canoniques identiques à JT01 |
| JT14 Clôture | montant + lettrage modifiés sur 2025 clôturé | PER_CLOTURE pour le montant ; info pour le lettrage |
| JT15 Comptes | `4011` et `40110`, compte de 12 car., compte hors plan | CPT_COLLISION_PADDING, CPT_LONGUEUR, CPT_INCONNU |
| JT16 Volume | 100 000 lignes générées (graine fixe) | contrôles identiques au nominal ; durée mesurée ; reprise après interruption |
| JT17 Multi-profils | grand livre puis FEC du même exercice | DOUBLON_INTER, aucune double comptabilisation |
| JT18 Séparation | même fichier pour CLI-TEST-A et B ; fichier de A déposé chez B | aucune clé partagée ; CLI_MISMATCH, 0 écriture |
| JT19 Injection | libellés commençant par `=`, `+`, `@`, `=IMPORTRANGE(…)` | valeurs stockées en texte, aucune formule évaluée |
| JT20 Aller-retour Sheets | comptes à zéros de tête, dates, montants | relecture identique à l'écriture |
| JT21 À-nouveaux / clôture | journal AN, écritures de clôture | EQU_AN conforme |

### 8.2 Tests unitaires (`core/`, sous Node, sans API Google)

- `parseMontant` (~20 cas : `""`, `"-0,00"`, `"1.234,56"`, `"1,234.56"`, 3 décimales, `"abc"`), `parseDate` (bissextiles, 31/02, numéro de série), `normCompte` (padding, trop long, scission), `normLibelleHash`.
- Empreintes : stabilité (valeurs de référence figées), sensibilité (1 centime = empreinte différente), indépendance à l'ordre pour `h_ecr_contenu`.
- `apparierLignes` : chaque passe isolément + égalités départagées de façon déterministe.
- `classer(base, fichier, perimetre)` : un test par case des matrices §6.5 et §6.6.
- Contrôles : pour chaque code, un cas qui déclenche et un cas limite qui ne déclenche pas.
- Machine à états : toute transition interdite lève une erreur.
- **Propriétés** : idempotence (`classer(B ⊕ F, F)` = 100 % INCHANGÉE) ; conservation (Σ Δ soldes = 0) ; Logger sans libellé ni montant.

### 8.3 Tests d'intégration (Apps Script, projet de test)

- Bout en bout sur classeur fictif : dépôt → publication → retour arrière.
- **Panne simulée à chaque étape** puis reprise → état final identique (checksum) à une exécution sans panne.
- Cloisonnement : deux comptes de test, aucun accès croisé.
- Publication refusée avec bloquant ouvert, ou staging modifié après validation.

### 8.4 Non-régression

Sortie attendue de chaque JTxx (classification, anomalies, soldes) versionnée en texte ; toute modification de règle relance la suite complète avec diff. Changement de version d'empreinte = migration, qui doit donner 100 % INCHANGÉE sur JT01.

### 8.5 Recette métier (dirigeant, classeur de test)

1. Premier import JT01. 2. Import suivant JT03 + JT04 + JT05 + JT07. 3. Réimport JT02. 4. Bloquant JT11 puis correction. 5. Dérogation sur JT14. 6. Annulation de la dernière publication.
Critères : chiffres affichés = attendus (§6.8, §8.1) ; anomalies visibles jusqu'à résolution ; état de la base reconstituable à n'importe quel import ; revue d'un import type en moins de 20 min.

### 8.6 Critères d'acceptation globaux

1. Double import du même fichier : 0 changement, événement journalisé.
2. Export cumulatif M+1 avec N nouvelles et K modifiées + lettrages : exactement N NOUVELLE et K MODIFIÉE, le lettrage seul n'étant pas une modification de fond.
3. Export partiel : aucune ABSENTE hors périmètre.
4. Réconciliations à 0 centime : écriture, journal, global, fichier = staging, actif N = actif N-1 + mouvements.
5. 0 ligne active orpheline (sans `raw_hash`, `import_id` ou `publication_id`).
6. Reprise après panne : état identique, aucun doublon.
7. 100 000 lignes traitées sans intervention manuelle ; durée consignée.
8. Fichier d'un autre client rejeté sans aucune écriture.
9. Aucune donnée comptable dans les logs techniques.
10. Zéros de tête, dates et montants intacts après aller-retour Sheets.

---

## 9. Plan de développement par lots

| Lot | Objectif | Livrables | Critère d'acceptation | Dépend de |
|---|---|---|---|---|
| **L0 Spécifications & jeux de test** | Figer les règles avant le code | Validation de ce cahier des charges ; décisions §11 ; mapping des 1–2 premiers formats ; exports réels **anonymisés** des clients pilotes ; jeux JT01–JT21 avec résultats attendus écrits à la main ; contrat d'interface du modèle canonique et des ports ; test de charge préliminaire (cellules, temps) | Chaque règle a ≥ 1 cas de test ; décisions D1–D8 tranchées ; volumétrie compatible ou contournement prévu | Dirigeant |
| **L1 Cœur métier (`core/`)** | Règles en JS pur testé sous Node | Parseur CSV, normalisation, empreintes, appariement, classification, contrôles, machine à états, plan de publication | 100 % des tests unitaires et de non-régression JT01–JT18 au vert, sans API Google | L0 |
| **L2 Socle multi-clients** | Base saine et cloisonnée | Gabarit de classeur client, CONSOLE, registre, script de création d'un client (dossiers, droits, `_META`), protections, chaîne `clasp` test/prod | Client fictif créé en < 15 min ; test de non-accès croisé réussi | L0 |
| **L3 Import & normalisation (adaptateurs)** | CSV → staging fiable | Connecteur Drive, archivage, `RAW_LIGNES`, `STAGING`, lots + reprise + verrous | JT01, JT12, JT13, JT19, JT20 conformes ; réimport rejeté ; JT16 passe par relances automatiques | L1, L2 |
| **L4 Comparaison & contrôles** | Classer et contrôler dans Sheets | Branchement diff + contrôles, `ANOMALIES`, `CONTROLES`, `TDB_CONTROLE` | 100 % des cas classés correctement ; chaque anomalie placée dans les jeux est détectée | L3 |
| **L5 Validation, publication, retour arrière** | Ne publier qu'après décision | Dialogues de revue et de validation, check-list, dérogations, publication par bascule, historique, retour arrière | Publication impossible avec bloquant ouvert ; retour arrière = checksum N-1 ; panne simulée à chaque étape sans corruption | L4 |
| **L6 Pilote réel** | Valider sur le terrain | 3 cycles d'import réels sur 1–2 clients ; registre des défauts ; corrections | 3 cycles sans incident bloquant dû à l'outil ; temps par import mesuré | L5, accord clients |
| **L7 Industrialisation** | Déployer à plusieurs clients | Documentation utilisateur, check-lists, procédure d'ajout d'un format, revue des accès, gestion des versions | Nouveau client sur format connu opérationnel en < 1 h | L6 |
| **L8 Trajectoire API** | Préparer l'application cible | Étude des API (Pennylane en priorité), `ApiConnector` prototype, choix de la base cible, plan de migration de l'historique | `core/` tourne sur une source API de test sans changement de règles ; historique migrable sans perte (contrôle par empreintes) | L7, décision dirigeant |

> Ajustement par rapport au plan initial du directeur des opérations : le cœur métier pur (`core/`) est développé **en premier** (L1), indépendamment de Google, sur la recommandation de l'architecte. Les règles sont ainsi testées avant d'écrire la moindre ligne d'Apps Script, et ce code est directement réutilisable dans l'application cible.

**Point de contrôle avant L1** : revue croisée architecture / spécifications pour vérifier qu'aucune clé ou règle n'est contredite par la structure.
**Option d'arrêt** : enveloppe de temps par lot ; arrêt possible après L5 si le gain n'est pas démontré (D12).

---

## 10. Risques

| # | Risque | Mitigation |
|---|---|---|
| R1 | Pas d'identifiant stable dans les CSV → fausses nouvelles / faux doublons | FEC en référence ; niveaux de clé K1–K4 déclarés ; empreintes séparées de la clé ; tests sur exports réels anonymisés |
| R2 | Lettrage/validation modifiés après coup → fausses modifications en masse | Empreintes `h_let` / `h_valid` séparées ; `M_LET` accepté automatiquement |
| R3 | Export partiel → fausses suppressions | Périmètre obligatoire ; comparaison limitée au périmètre ; VOL_SUPPR_MASSE bloquant |
| R4 | Mélange de données entre clients | Classeur + dossier par client ; triple vérification ; `client_id` dans toutes les clés ; aucune formule inter-classeurs ; JT18 |
| R5 | Partage Drive mal réglé / compte personnel | Workspace, pas de lien public, compte technique propriétaire, revue des accès scriptée |
| R6 | Limites Apps Script dépassées | Lots + reprise ; brut dans Drive ; mesure en L0/L3 ; archivage par exercice |
| R7 | Publication de données fausses | Staging, validation, publication atomique par bascule, retour arrière, REC_MIROIR |
| R8 | Formats variables selon logiciels et versions | Profils versionnés ; colonne inconnue = blocage |
| R9 | Conversions implicites de Sheets (zéros de tête, dates, flottants) | Format texte avant écriture ; centimes entiers ; JT20 |
| R10 | Injection de formules via le CSV | Neutralisation ; JT19 ; contrôle anti-`IMPORTRANGE` |
| R11 | Outil pris pour la comptabilité officielle | Mention « copie d'analyse » ; clause de lettre de mission |
| R12 | Données personnelles dans les libellés | Registre RGPD, DPA, durée de conservation ; logs sans données ; aucun envoi externe |
| R13 | Dérive du code entre clients | Moteur unique versionné, aucun code dans les classeurs clients |

---

## 11. Décisions à trancher avant programmation

> **Mise à jour v0.2** — D1 à D8 ont été tranchées par le dirigeant (colonne « Décision »). Les autres restent ouvertes ; voir aussi §25 pour le MVP.

Les décisions **D1 à D8** conditionnent le lot L0 et la structure des données ; les autres peuvent être tranchées pendant L0.

| # | Question | Recommandation des agents | Décision |
|---|---|---|---|
| **D1** | Source de référence : FEC obligatoire, ou grand livre accepté ? | **FEC en priorité** ; grand livre accepté au niveau K3/K4 avec ses limites affichées | **Validé** — FEC prioritaire, grand livre CSV accepté (MVP : grand livre **avec numéro d'écriture** uniquement, cf. §16) |
| **D2** | Topologie : moteur central sans code chez les clients (D) ou bibliothèque + script lié (C) ? | **Option D** ; C seulement si les collaborateurs doivent lancer l'import depuis le classeur client | **Validé** — moteur central, aucun code dans les classeurs clients |
| **D3** | Compte Google : Workspace ou personnel ? | **Workspace au nom du cabinet** avec DPA (dépense à valider) ; compte personnel déconseillé pour des données clients | **Validé** — Google Workspace professionnel avant toute donnée réelle (recommandation MVP : dès l'environnement de test, cf. §25) |
| **D4** | Compte technique propriétaire distinct des comptes nominatifs ? | Oui | **À étudier** — identité technique dédiée selon les possibilités réelles de Workspace (options §13.4, spikes SP8–SP10) |
| **D5** | Le lettrage et la date de validation comptent-ils comme modification ? | Non pour le lettrage (accepté auto, tracé) ; la validation est tracée en info | **Validé** — lettrage seul traité automatiquement comme évolution non financière, tracé |
| **D6** | Écriture disparue : traitement ? | Avertissement avec décision explicite ; bloquant sur exercice clôturé ; **jamais d'effacement**, statut `SUPPRIMEE_SOURCE` | **Validé** — aucune suppression silencieuse des écritures absentes |
| **D7** | Seuils : VOL_VARIATION 20 %, VOL_SUPPR_MASSE 5 % ou 50 écritures, MNT_HORS_BORNES | Valeurs cabinet par défaut, surchargeables par client | **Validé provisoirement** — seuils proposés, à calibrer après les tests |
| **D8** | Retour arrière : onglet `__PREV` (≈ ×2 cellules) ou reconstruction depuis l'historique ? | **Reconstruction depuis `ECRITURES_HISTO` / `MOUVEMENTS`** (économie de cellules), limitée au dernier import | **Validé sous réserve** — reconstruction depuis l'historique, si les tests de reprise et de retour arrière (T13, T14) réussissent |
| D9 | Publication partielle ? | Non en V1 : tout ou rien | Ouverte |
| D10 | Qui valide, double regard ? | Dirigeant pour dérogations, absentes, clôturé, suppressions massives ; tant que seul : check-list et validation différée | Ouverte |
| D11 | Durée de conservation des bruts et historiques | Durée de la mission puis règle écrite dans la lettre de mission ; avis d'un professionnel habilité (RGPD et obligations comptables) | Ouverte |
| D12 | Enveloppe de temps / prestataires | Enveloppe par lot, arrêt possible après L5 | Ouverte |
| D13 | Clause « copie d'analyse » dans la lettre de mission | Oui, relue par un juriste | Ouverte |
| D14 | Granularité : un classeur par client (archives par exercice) ou par client × exercice ? | Par client, archivage des exercices clos au-delà de 60 % d'occupation | Ouverte |
| D15 | Langage : JavaScript + JSDoc ou TypeScript + bundler ? | À trancher en L0 ; TypeScript facilite la migration mais alourdit la chaîne | Ouverte |
| D16 | Clients pilotes | 1 à 2 clients sur logiciel courant, idéalement Pennylane (prépare L8) | Ouverte |
| D17 | Traitement des montants négatifs et des écritures validées modifiées | À valider par un expert-comptable [V-EC] | Ouverte |
| D18 | Longueur de compte `L` et règle de padding par client | Paramètre client, fixé à la création | Ouverte |
| D19 | Le client final accède-t-il à ses données ? | Non en V1 ; si oui plus tard, classeur de restitution séparé alimenté par le moteur | Ouverte |

### Renforts suggérés par les agents

Les agents signalent l'utilité d'agents complémentaires, à créer si vous le souhaitez : **expert-comptable & fiscal** (validation des points [V-EC]), **ingénieur QA** (jeux de test, recette), **data-engineer** (adaptateurs, performance). En attendant, le dirigeant assure ces validations.

### Prochaines actions proposées (v0.1 — remplacées par §22–§25)

1. **Dirigeant** : relire ce document, trancher D1 à D8.
2. **Dirigeant** : obtenir 1 à 2 exports réels (FEC de préférence) des clients pilotes et les anonymiser.
3. **Ingénieur outils financiers** : construire les jeux JT01–JT21 et leurs résultats attendus.
4. **Architecte** : contrat d'interface du modèle canonique et des ports.
5. **Revue croisée**, puis feu vert pour L1.

---
---

# Partie B — MVP (premier prototype)

Contributeurs v0.2 : `architecte` (architecture technique MVP), `ingenieur-outils-financiers` (règles fonctionnelles MVP), `directeur-operations` (livrables, estimations, critères, reports, planning). Tout reste à l'état de **proposition** : aucun code, test ou mesure n'existe à ce jour.

## 12. Principes du MVP

**Périmètre demandé par le dirigeant** : import CSV grand livre et FEC · normalisation · détection des nouvelles lignes · prévention des doublons · détection des corrections · historique des imports · contrôles comptables essentiels · validation avant publication · reprise après échec et retour arrière testé. Sécurité, intégrité et isolation des clients conservées.

**Trois principes de simplification**

1. **Repli sûr** : toute fonctionnalité reportée doit se replier sur un comportement qui **bloque** ou **laisse visible** le cas non traité finement — jamais sur une donnée fausse publiée sans que personne le voie. Exemple : sans détection de renumérotation, une écriture renumérotée apparaît comme ABSENTE + NOUVELLE ; l'ABSENTE n'est jamais supprimée sans décision (D6), le cas reste donc visible.
2. **Imposer plutôt que deviner** : encodage, séparateur, format de date, type d'export sont imposés par le profil ; tout écart bloque.
3. **Le cœur reste portable** : règles en JavaScript pur testées sous Node, réutilisables telles quelles dans l'application cible.

**Décisions validées appliquées** : D1, D2, D3, D5, D6, D7 (provisoire), D8 (sous réserve de T13/T14). D4 à étudier (§13.4).

## 13. Architecture technique MVP

### 13.1 Ce qu'on garde, simplifie ou reporte

| Élément | Cible (partie A) | MVP |
|---|---|---|
| Topologie | CONSOLE + un classeur par client sans code | **Gardée** (D2). Script lié à la CONSOLE : menu + un seul dialogue HTML de revue/validation |
| Drive | Arborescence complète, idéalement un Drive partagé par client | **Simplifiée** : un Drive partagé **par environnement** (`Pilotage-TEST`, puis `Pilotage-PROD`). `_Systeme/CONSOLE`, `_Systeme/_Quarantaine/`, `Clients/<ID>/{01_Depot, 02_Archive, <ID>_Compta}`. Rejets ordinaires dans `02_Archive` préfixés `REJ_` ; fichier d'un autre client en `_Quarantaine` (accès dirigeant seul) |
| Drive partagé par client | Idéal | Reporté jusqu'à l'arrivée d'un second collaborateur |
| Archives par exercice | Au-delà de 60 % d'occupation | Reportées ; mesure d'occupation + **plafond de volume ferme** (§25) |
| Chaîne d'outils | Git, clasp, test/prod, versions taguées | **Gardée, allégée** : Git + clasp, deux CONSOLE (TEST, PROD) avec leur `scriptId`. `tool_version` = constante du code, inscrite dans chaque import. Onglet `RELEASES` reporté (tag Git) |
| Langage | JS ou TypeScript (D15) | **JavaScript ES2019+ et JSDoc, sans TypeScript ni bundler**. Chaque fichier du cœur est une IIFE exposant un objet global, avec garde `module.exports` pour Node ; ordre de chargement par `filePushOrder` de clasp [À VÉRIFIER]. esbuild si le cœur dépasse ~15 fichiers |
| Tests | Node sur `core/` | `node:test` intégré, aucune dépendance. Tests du cœur **et** des cas d'usage avec adaptateurs en mémoire et **injection de pannes** |
| Découpage | ~10 sous-dossiers | **4 dossiers** : `core/` (pur), `app/` (cas d'usage via ports), `gas/` (adaptateurs, menu, déclencheurs), `tests/`. Ports dans un seul fichier de typedefs JSDoc : `FileStore`, `Hasher`, `Repo`, `Lock`, `Clock`, `Budget`, `Log`, `Scheduler`. Un test interdit `SpreadsheetApp`, `DriveApp`, `Utilities`, `LockService`, `ScriptApp` dans `core/` et `app/` |
| `RAW_LIGNES` | Brut dédoublonné dans Sheets | **Reporté**. Le fichier archivé dans Drive (sha256 dans `IMPORTS`) reste la référence ; chaque ligne active porte `source_import_id` + `source_rang` |
| `TDB_CONTROLE` à formules | Recalculé | **Remplacé par `SYNTHESE`** : valeurs écrites par le script, sans formule |
| Profils | Par client, catalogue | 2 modèles dans la CONSOLE (FEC générique, grand livre du logiciel pilote) ; profil du client versionné dans `CONFIG` |

### 13.2 Plafond de volume

Avec le double tampon d'actif (§14), 100 000 lignes représentent ≈ 8 M cellules, pour une limite de 10 M par classeur [À VÉRIFIER]. **Proposition : plafond de 50 000 lignes actives par classeur au MVP**, ajusté par les spikes SP4, SP5, SP7 ; refus explicite au-delà (aucune dégradation silencieuse).

### 13.3 Arbitrage technique entre agents

L'argument « économie de cellules » qui motivait D8 ne tient plus avec le double tampon, nécessaire pour une publication atomique. D8 reste pertinent pour une autre raison — l'historique `MOUVEMENTS` permet l'audit et la reconstitution de n'importe quel état passé — et le double tampon apporte **gratuitement** un filet de sécurité : après une publication N, l'onglet inactif contient exactement l'actif N-1 tant qu'aucune nouvelle publication n'a commencé. La reconstruction (D8) sera donc **vérifiée contre ce tampon** dans T14, et ce tampon constitue le repli si la réserve de D8 n'est pas levée.

### 13.4 D4 — Identité technique : options [À VÉRIFIER dans la documentation Google actuelle]

| Option | Principe | Limites |
|---|---|---|
| **A. Pas de compte technique** | Fichiers propriété du Drive partagé (de l'organisation) ; moteur exécuté sous le compte du dirigeant | Les protections ne l'empêchent pas de modifier une donnée : seule la **détection** fonctionne (checksum, journaux). Déclencheurs liés à son compte. Aucun coût |
| **B. Utilisateur Workspace dédié** (`moteur@cabinet`, licence) | Seul modificateur des classeurs clients, propriétaire des déclencheurs ; moteur déployé en application web « exécuter en tant que moi », accès domaine ; humains en lecture | Interface web au lieu du menu Sheets (un menu s'exécute sous l'identité de celui qui clique). Licence, 2FA, garde du compte. Seule option donnant un vrai moindre privilège dans Apps Script |
| C. Compte de service GCP | API REST Sheets/Drive avec clé privée | Apps Script ne s'exécute pas sous un compte de service ; exigerait `external_request` (contraire à S9) et une clé secrète. **Reporté à l'application cible** |
| D. Délégation à l'échelle du domaine | — | **Rejetée** : privilège excessif |

**Recommandation** : option A sur données fictives, spike de B en parallèle (SP8, SP9) ; choix définitif **avant les données réelles** (jalon J4). A reste acceptable tant que le dirigeant est seul ; B s'impose dès qu'un collaborateur intervient.

## 14. Onglets MVP

### 14.1 Classeur client `<CLIENT_ID>_Compta` — 7 onglets (+ `SYNTHESE` facultatif)

| Onglet | Remplace (partie A) | Rôle | Colonnes essentielles | Mutabilité |
|---|---|---|---|---|
| `CONFIG` | `_META`, `PROFIL_SOURCE`, journaux, seuils | Identité, versions, paramètres | clé, valeur (texte ou JSON), version, valide_depuis, auteur, horodatage. Clés : `client_id`, `siren`, `schema_version`, `longueur_compte`, `exercices` (OUVERT/CLÔTURÉ), `profil`, `seuils`, **`actif_pointeur`** | Ajout seul (dernière version par clé fait foi), **sauf** la cellule `actif_pointeur`, modifiée par le moteur et tracée dans `JOURNAL` |
| `IMPORTS` | `IMPORTS`, `PUBLICATIONS` | Une ligne par import : état courant, résumé de publication | import_id, créé_par/le, fichier, file_id, file_sha256, taille, profil_version, tool_version, périmètre (exercice, du, au, journaux), **statut, étape, curseur, run_token, erreur** (code sans données), compteurs, totaux D/C fichier et staging, validation_fp, publication_id, checksum_avant/après, nb_lignes, ΣD, ΣC de l'actif, annulé_par | Seul onglet d'état modifiable (statut, étape, curseur, run_token, erreur). Copie de commodité : les valeurs qui font foi sont dans `JOURNAL` |
| `JOURNAL` | `IMPORT_EVENTS`, `VALIDATIONS`, `ANOMALIES_HISTO` | Journal de tout ce qui se passe | event_id, horodatage, import_id, publication_id, type (TRANSITION, ERREUR, DÉCISION, ANOMALIE_STATUT, DÉROGATION, VALIDATION, PUBLICATION, ANNULATION, PURGE_NON_VALIDÉE, ALERTE_INTÉGRITÉ), de → vers, étape, acteur, objet_type, objet_clé, détails JSON court | **Ajout seul** |
| `STAGING` | `STAGING`, `STAGING_ABSENTES` | Lignes de l'import en cours, classifiées ; les ABSENTES y figurent à partir d'une copie de l'actif | import_id, source_rang, classification, sous_types, ligne_uid, cle_ecriture, 18 champs canoniques, exercice_id, h_fond, h_desc, h_let, décision, décision_par/le | Recalculé à chaque import ; décisions via le dialogue, journalisées ; vidé après publication ou abandon |
| `CONTROLES` | `CONTROLES`, `ANOMALIES` | Résultats de contrôle (niveau import) et anomalies (niveau objet) | import_id, control_id, control_version, niveau (CONTRÔLE / ANOMALIE), gravité, objet_type, objet_clé, attendu, obtenu, écart, statut (OUVERTE, EN_COURS, RÉSOLUE, DÉROGÉE), commentaire, traité_par/le, 1re/dernière détection | Création en ajout seul ; seuls statut, commentaire et `traité_*` changent, chaque changement journalisé |
| `ACTIF_A` / `ACTIF_B` | `ECRITURES_ACTIVES` + `__NEXT` | **Double tampon** : `actif_pointeur` désigne l'actif, l'autre sert de zone de construction (masqué) | 18 champs canoniques, exercice_id, ligne_uid, cle_ecriture, version, statut (ACTIVE / SUPPRIMEE_SOURCE), first_import_id, source_import_id, source_rang, last_publication_id, h_fond, h_desc, h_let | L'actif n'est **jamais modifié sur place** : le tampon est reconstruit puis le pointeur bascule |
| `MOUVEMENTS` | `ECRITURES_HISTO`, `MOUVEMENTS` | Différences publiées avec **l'image complète de la ligne avant changement** | mouvement_id, publication_id, type_pub (PUBLICATION / ANNULATION), import_id, ligne_uid, type (INSERTION, MODIFICATION, LETTRAGE, SUPPRESSION_LOGIQUE), sous_types, version avant/après, h_avant, h_après, colonnes de l'actif avant changement | Ajout seul une fois la publication validée ; les lignes d'une publication interrompue sont purgées à la reprise (seule suppression autorisée, journalisée `PURGE_NON_VALIDÉE`) |
| `SYNTHESE` (facultatif) | `TDB_CONTROLE` | Bandeau d'état, compteurs, réconciliations, variations de soldes, occupation | Valeurs seulement | Réécrit par le script |

`REFERENTIELS` (plan de comptes) est reporté avec `CPT_INCONNU` (V1.1).

### 14.2 CONSOLE — 3 onglets, aucune donnée comptable

| Onglet | Rôle | Mutabilité |
|---|---|---|
| `CLIENTS` | Registre : client_id, nom court, SIREN, spreadsheet_id, dossier_id, depot_id, archive_id, statut, schema_version, dernier statut d'import | Modifié par les seules fonctions d'administration, journalisé |
| `PROFILS` | Modèles FEC et grand livre : profil_id, version, logiciel, type, définition JSON, statut, validé_par/le | Ajout seul |
| `JOURNAL_TECH` | Exécutions, rejets, quarantaines : horodatage, execution_id, client visé, file_id, action, code, durée, compteurs | Ajout seul ; **jamais** de libellé, montant ni nom de fichier client |

### 14.3 Retour arrière par reconstruction (D8)

1. **Préalables** : N est la dernière publication validée non annulée ; aucun import du client en cours.
2. **Reconstruction** du tampon à partir de l'actif : retrait des `ligne_uid` insérées par N ; restauration de l'image avant changement pour chaque ligne modifiée ou supprimée logiquement par N.
3. **Vérification** : checksum, nombre de lignes, ΣD, ΣC du tampon **égaux au `checksum_avant` de N** — et identiques à l'actif N-1 encore présent dans le tampon inactif (§13.3). Écart → abandon avec alerte bloquante.
4. **Mouvements inverses** écrits sous une publication R de type ANNULATION (l'historique reste en ajout seul).
5. **Bascule** du pointeur, `JOURNAL.ANNULATION`, `IMPORTS.statut = ANNULÉ`. Le fichier redevient réimportable.

Un seul niveau d'annulation ; pas d'annulation d'une annulation (on réimporte). Les états passés restent reconstituables en lecture pour l'audit.

## 15. États, idempotence, reprise

### 15.1 Machine à états (dans `IMPORTS`)

| Statut | Étapes (champ `étape` + curseur) | Sorties autorisées |
|---|---|---|
| `REÇU` | triple contrôle client, sha256, archivage | `TRAITEMENT`, `REJETÉ` |
| `TRAITEMENT` | NORMALISATION → COMPARAISON → CONTRÔLES (curseur par lot) | `À_VALIDER`, `REJETÉ` (bloquant non dérogeable), `ABANDONNÉ` |
| `À_VALIDER` | décisions, dérogations, check-list | `VALIDÉ`, `ABANDONNÉ`, `TRAITEMENT` (relance des contrôles) |
| `VALIDÉ` | empreinte figée | `PUBLICATION`, `À_VALIDER` (empreinte divergente) |
| `PUBLICATION` | CONSTRUCTION → MOUVEMENTS → BASCULE → FINALISATION | `PUBLIÉ` |
| `PUBLIÉ` | — | `ANNULATION` (dernière publication, aucun import en cours) |
| `ANNULATION` | CONSTRUCTION → VÉRIFICATION → MOUVEMENTS → BASCULE | `ANNULÉ` |
| Terminaux | `REJETÉ`, `ABANDONNÉ`, `ANNULÉ` | — |

Simplifications : **pas de statut ÉCHEC** (une erreur laisse statut et étape inchangés, renseigne `erreur` et journalise ; la reprise relance l'étape depuis le curseur) ; ARCHIVÉ/NORMALISÉ/COMPARÉ/CONTRÔLÉ deviennent des valeurs d'étape ; REMPLACÉ fusionné dans ABANDONNÉ. Toute transition absente de la table lève une exception (testé).

### 15.2 Idempotence

1. **Fichier** : `file_sha256` unique parmi les imports PUBLIÉ (non annulés) ou en cours du client ; nouvel essai possible après REJETÉ, ABANDONNÉ ou ANNULÉ.
2. **Lots** : écrire le lot → `flush` → enregistrer le curseur. À la reprise, **tronquer l'onglet cible au nombre de lignes du curseur** avant de réécrire (STAGING, tampon, MOUVEMENTS non validés).
3. **Validation** : empreinte couvrant STAGING, décisions, statuts et dérogations des anomalies ; publication refusée si elle a changé.
4. **Point de validation unique** : l'écriture de la cellule `actif_pointeur` (`ACTIF_B|PUB-0007`). Avant : une reprise reconstruit ; après : elle finalise.
5. **Intégrité** : checksum de l'actif recalculé au début de chaque import et annulation, comparé à la dernière publication journalisée ; écart → `SYS_ACTIF_ALTERE` (bloquant non dérogeable).

### 15.3 Verrouillage et reprise

- `LockService.getScriptLock()` tenu pendant tout un segment d'exécution (≤ ~4 min 30) : clients traités en série, suffisant pour un opérateur seul. Bail par client reporté.
- Invariant : **un seul import non terminal par client**, vérifié sous verrou.
- `run_token` régénéré à chaque segment : un déclencheur périmé s'arrête sans rien faire.
- Avant épuisement du budget, **un seul** déclencheur ponctuel de relance est programmé, supprimé au segment suivant. Bouton « Reprendre » en secours. La relance repart toujours de (statut, étape, curseur), jamais de la mémoire.

## 16. Règles fonctionnelles MVP

### 16.1 Modèle canonique

Les **18 champs FEC** restent des colonnes du modèle (stockés s'ils sont présents). Seuls 7 sont **indispensables** (vide ou invalide → ligne rejetée) : `journal_code`, `ecriture_num`, `ecriture_date`, `compte_num`, `ecriture_lib`, `debit_cts`, `credit_cts`. `piece_ref` est indispensable pour le FEC. `comp_aux_num`, `ecriture_let`, `date_let`, `valid_date` sont utilisés (lettrage D5, gravité des modifications). Les libellés de journal/compte/auxiliaire et `piece_date` sont stockés sans contrôle ; la devise est stockée et incluse dans le fond, sans contrôle de cohérence.

### 16.2 Normalisation (`norm_v1`)

| Gardé | Reporté (repli sûr) |
|---|---|
| Encodage **imposé** (UTF-8 ou Windows-1252), BOM retiré, NFC ; U+FFFD ou double encodage → bloquant | Détection automatique (profil faux → STR_ENCODAGE / STR_ENTETE bloquant) |
| Séparateur **imposé** (TAB, `\|`, `;`), guillemets RFC 4180 | Détection automatique (en-tête non reconnu → bloquant) |
| Dates au format **imposé** (`AAAAMMJJ`, `JJ/MM/AAAA`, ISO) | `JJ/MM/AA`, numéro de série : seulement si un export pilote l'exige |
| Montants parsés depuis la chaîne → **centimes entiers** (espaces dont U+00A0/U+202F, `-` en tête ou fin, parenthèses, ≤ 2 décimales) | — |
| Sens : débit/crédit **ou** montant + sens ; D et C non nuls → rejet | Montant signé : seulement si le grand livre pilote l'exige |
| Texte : trim, espaces réduits, caractères de contrôle retirés ; majuscules pour journal, compte, auxiliaire, devise | — |
| **Neutralisation des formules** (`=`, `+`, `-`, `@`) — non négociable | — |
| Comptes : retrait espaces/points/tirets, **padding à droite par 0 jusqu'à `L`** ; trop long ou non numérique → rejet ; collision de padding → bloquant | Scission collectif/auxiliaire (`401DUPONT`) : rejet ; le profil doit mapper une colonne auxiliaire |
| Lettrage : trim ; `""`, `null`, `"0"` = vide si le profil le déclare | — |
| Lignes entièrement vides ignorées et comptées | Lignes parasites (totaux, reports) : rejet ; grand livre exporté au **format tabulaire** exigé |

### 16.3 Profils

- **2 modèles** : `FEC_GENERIQUE` (18 champs normés, SIREN dans le nom de fichier ; paramètres : séparateur, encodage, décimale, mode de sens) et `GL_<logiciel pilote>` (construit sur un export réel anonymisé, **avec numéro d'écriture**).
- Instance par client dans `CONFIG`, versionnée (brouillon → validé → actif), validée par le dirigeant. Paramètres : type, encodage, séparateur, décimale, format de date, mode de sens, mapping, `L`, portée de numérotation (`EXERCICE` par défaut, `JOURNAL_MOIS` en option), valeurs « lettrage vide », contiguïté des écritures (OUI pour le FEC, NON pour un grand livre trié par compte).
- En-tête : colonne obligatoire absente ou colonne inconnue → bloquant non dérogeable (les colonnes à ignorer sont mappées explicitement).
- **Un seul type de profil par exercice** : le premier import fixe FEC ou GL ; un import d'un autre type → `PRF_CHANGEMENT` (repli sûr de DOUBLON_INTER).

### 16.4 Identification

- **Clé K2 uniquement** : `cle_ecriture = client_id | exercice_id | journal_code | ecriture_num` (+ `| AAAA-MM` en portée `JOURNAL_MOIS`). La date n'entre pas dans la clé en portée `EXERCICE` (date corrigée = `M_DATE`).
- **Grand livre sans numéro d'écriture : refusé** au MVP, avec le message « exporter le FEC » (K3/K4 reportés : K3 fusionne silencieusement des écritures, K4 transforme chaque correction en ABSENTE + NOUVELLE). K1 réservé à la trajectoire API.
- **Version à l'écriture entière** : une écriture MODIFIÉE remplace toutes ses lignes (anciennes versées dans `MOUVEMENTS`, nouvelles en `version + 1`) ; `ligne_uid = cle_ecriture#k`, `k` = rang dans l'ordre canonique de la version (compte, auxiliaire, montant, rang source). Cela supprime l'appariement ligne à ligne ; les variations de soldes restent exactes.
- **3 empreintes par ligne** (SHA-256 préfixé `v1:` ou comparaison directe, selon SP2) :

| Empreinte | Champs |
|---|---|
| `h_fond` | compte_num, comp_aux_num, debit_cts, credit_cts, idevise, montant_devise_cts |
| `h_desc` | ecriture_lib, piece_ref, piece_date, journal_lib, compte_lib, comp_aux_lib, valid_date (trim, NFC, espaces réduits — tout changement visible est détecté, en info) |
| `h_let` | ecriture_let, date_let |

`raw_hash` est remplacé par la référence fichier + rang ; `file_sha256` gardé ; `h_ecr_contenu` reporté.

### 16.5 Classification (sans appariement)

Pour chaque `cle_ecriture` présente dans la base B (dans le périmètre) et/ou dans le fichier F, on compare trois multiensembles triés : `T_f` (les `h_fond`), `T_fd` (couples fond+desc), `T_fdl` (triplets fond+desc+let).

1. `T_fdl` identiques et même `ecriture_date` → **INCHANGÉE**.
2. Sinon **MODIFIÉE** avec sous-types cumulables : `M_FOND` si `T_f` diffère (montant, compte, auxiliaire, devise, lignes ajoutées/retirées) ; `M_DATE` si la date diffère ; `M_DESC` si `T_f` égal mais `T_fd` diffère ; `M_LET` si `T_fd` égal mais `T_fdl` diffère (**lettrage seul**, D5).

Déterministe, indépendant de l'ordre des lignes. Correspondance avec la cible : `M_FOND` regroupe `M_MNT`, `M_CPT`, `M_AUX`, `M_LIGNES`, `M_DEV` ; `M_DESC` regroupe `M_LIB`, `M_PIECE`, `M_VALID`.

| Statut | MVP | Règle / repli sûr |
|---|---|---|
| REIMPORT_FICHIER | Gardé | `file_sha256` déjà publié (non annulé) : arrêt journalisé |
| NOUVELLE | Gardé | clé absente de B |
| INCHANGÉE | Gardé | |
| MODIFIÉE | Gardé | 4 sous-types ci-dessus |
| ABSENTE | Gardé | clé dans B, dans le périmètre, absente de F ; **décision obligatoire** ; jamais supprimée sans décision (D6) |
| COLLISION | Gardé, bloquant non dérogeable | dans F, même clé avec plusieurs dates ou journaux, ou (écritures contiguës) blocs disjoints de contenu différent |
| DOUBLON_INTRA | Gardé (FEC seulement) | blocs disjoints identiques : un seul conservé. Grand livre non contigu : indétectable → repli `REC_TOTAL_SAISI` |
| RENUMÉROTÉE | Reporté | ABSENTE + NOUVELLE ; l'ABSENTE en brouillard porte une aide « probablement validée sous un nouveau numéro » |
| JUMELLE | Reporté | deux NOUVELLES normales (information perdue, aucun risque) |
| DOUBLON_INTER | Reporté | `PRF_CHANGEMENT` bloquant |
| RAPPROCHEMENT_PROBABLE | Reporté | sans objet en K2 |

**Gravité des modifications**

| Sous-type | Écriture non validée | Écriture validée | Exercice clôturé |
|---|---|---|---|
| `M_LET` | Info, automatique | Info, automatique | Info, automatique |
| `M_DESC` | Info | Info | Bloquant |
| `M_FOND`, `M_DATE` | Avertissement | Avertissement « validée » [V-EC] | Bloquant |

Passage de « validée » à « vide » : `IDN_DEVALIDEE` (avertissement, bloquant sur exercice clôturé).

## 17. Contrôles essentiels MVP

Gravités : **BND** bloquant non dérogeable · **B** bloquant dérogeable par le dirigeant · **A** avertissement à acquitter · **I** info. **Une ligne rejetée bloque l'import** (on ne publie jamais une écriture amputée) ; les rejets sont agrégés par code (nombre de lignes, liste des rangs).

| Code | Gravité | Règle |
|---|---|---|
| CLI_MISMATCH | BND | dossier ≠ client sélectionné, ou SIREN du nom FEC ≠ registre ; quarantaine, aucune écriture |
| STR_ENCODAGE | BND | U+FFFD ou double encodage |
| STR_ENTETE | BND | colonne obligatoire absente ou colonne inconnue |
| REJ_LIGNES | BND | colonnes en nombre incorrect, champ indispensable vide, date/montant/compte invalide, compte trop long ou non numérique, D et C non nuls, > 2 décimales |
| SYS_ACTIF_ALTERE | BND | checksum de l'actif ≠ dernière publication |
| PRF_CHANGEMENT | BND | type de profil ≠ celui de l'exercice |
| PER_HORS_PERIMETRE | BND | ligne hors du périmètre déclaré (périmètre **obligatoire** : exercice + du/au, tous journaux) |
| IDN_COLLISION | BND | §16.5 |
| CPT_COLLISION_PADDING | BND | deux comptes source → même compte normalisé |
| REC_LIGNES | BND | lues = importées + rejetées + vides + doublons ignorés |
| REC_TOTAUX | BND | ΣD, ΣC parsés = staging **relu depuis Sheets** (aller-retour) |
| REC_MIROIR | BND | après fusion simulée, actif restreint au périmètre (hors ABSENTES reportées) = fichier : lignes, ΣD, ΣC, solde par compte |
| REC_PUBLICATION | BND | actif N = actif N-1 + mouvements (checksum, ΣD, ΣC), contrôlé avant bascule |
| EQU_GLOBAL | BND (FEC) / B (GL) | ΣD = ΣC sur le fichier |
| EQU_ECRITURE | B | ΣD ≠ ΣC par `cle_ecriture`, tolérance 0 |
| PER_CLOTURE | B | NOUVELLE, ABSENTE ou MODIFIÉE (hors `M_LET`) sur exercice clôturé |
| VOL_SUPPR_MASSE | B | ABSENTES > 5 % des écritures du périmètre ou > 50 (D7, provisoire) |
| CPT_CLASSE | B | premier chiffre hors 1–8 [V-EC classe 9] |
| REC_TOTAL_SAISI | B | total D/C du logiciel saisi par l'opérateur ≠ total importé ; **obligatoire pour le grand livre**, facultatif pour le FEC |
| IDN_ABSENTE | A (B si clôturé) + décision | |
| IDN_MOD_FOND | A (mention « validée » si `valid_date`) | `M_FOND` ou `M_DATE` |
| IDN_DEVALIDEE | A | |
| IDN_DOUBLON_INTRA | A | un bloc conservé |
| `M_DESC`, `M_LET`, MNT_NUL, MNT_NEG [V-EC], SEC_NEUTRALISE | I | comptés, visibles |

**Restitution obligatoire avant validation** : variation de solde par compte (avant → après simulé, triée par écart absolu), avec contrôle de conservation Σ variations = 0.

**Reportés** (≈ 22) : EQU_JOURNAL_PERIODE, EQU_AN, REC_BALANCE, PER_HORS_EXERCICE (vérifié à la déclaration du périmètre), PER_FUTUR, PER_CONTINUITE, PER_ORDRE (question de la check-list), PER_PERIM_DEDUIT, PER_DATES_INCOH, CPT_INCONNU, CPT_AUX_ORPHELIN, CPT_LIB_DIVERGENT, CHP_DERIVE, CHP_DEVISE, MNT_HORS_BORNES, VOL_VARIATION, SOL_CLOTURE_MODIFIE (couvert par PER_CLOTURE), IDN_RENUM, IDN_JUMEAU, IDN_DOUBLON_INTER, IDN_RAPPROCHEMENT_PROBABLE, IDN_K3_AMBIGU. SYS_OCCUPATION reste un indicateur technique dans `SYNTHESE`.

## 18. Validation, publication, retour arrière MVP

**Rôles** : le dirigeant est préparateur et valideur ; deux actions distinctes et journalisées (« soumettre », puis « valider ») avec check-list et écran de synthèse. Pas de délai imposé entre les deux (A7, à confirmer ; remplace la « validation différée » de D10 pour le MVP).

**Conditions de go (toutes requises)**

1. Aucun BND.
2. Chaque B dérogé : code, objet précis (jamais « tout »), motif ≥ 20 caractères, valideur, horodatage.
3. Chaque A acquitté (acquittement en lot par code admis, commentaire unique).
4. Chaque ABSENTE décidée (en lot admis, avec motif) ; au-delà du seuil VOL_SUPPR_MASSE, dérogation obligatoire.
5. Aucun autre import non terminal pour ce client.
6. Check-list signée (dont : fichier = export le plus récent ; variations de soldes expliquées).
7. Empreinte du staging figée ; publication refusée si elle a changé.

**Dérogations** : portée « cet import » ; **reconduction automatique tracée** si l'objet dérogé est inchangé à l'import suivant (même code, même clé, même contenu) — A5, à confirmer. Jamais supprimées.

**Décision sur une ABSENTE** : *accepter* → `SUPPRIMEE_SOURCE` (suppression logique, image avant conservée) ; *reporter* → reste ACTIVE, anomalie ouverte, reproposée à l'import suivant.

**Publication atomique** (tout ou rien) : une panne avant bascule laisse l'actif N-1 intact ; la relance reconstruit depuis le début ou l'import est abandonné.

**Reprise après échec** : exigence fonctionnelle — le résultat final est **identique à une exécution sans panne** (checksum, compteurs, aucun doublon dans le staging, les mouvements ou le journal).

**Retour arrière** : dernière publication seulement, aucun import en cours ; mécanisme §14.3 ; contrôle checksum/lignes/ΣD/ΣC = N-1.

## 19. Sécurité et isolation non négociables

| # | Mécanisme | Raison |
|---|---|---|
| S1 | Workspace professionnel avant toute donnée réelle ; d'ici là, uniquement des données fictives `CLI-TEST` | D3 |
| S2 | Un classeur et un dossier par client ; `client_id` dans toutes les clés | Isolation, aucune collision |
| S3 | Triple contrôle (dossier de dépôt = registre = `CONFIG.client_id`, SIREN du nom FEC) **avant toute écriture** ; échec → quarantaine système, zéro écriture côté client | Contamination croisée |
| S4 | Aucun code, aucune formule dans les onglets de données ; contrôle anti-`IMPORTRANGE` | Fuite par formule |
| S5 | Neutralisation `= + - @`, format texte avant écriture, centimes entiers | Injection, conversions implicites |
| S6 | Fichier brut archivé, sha256 revérifiable, jamais réécrit | Traçabilité |
| S7 | `JOURNAL` et `MOUVEMENTS` en ajout seul, empreinte de validation, checksum de l'actif vérifié à chaque import | Détection des altérations |
| S8 | Aucun libellé, montant ni nom de fichier client dans `console.log`, `JOURNAL_TECH` ou les exceptions ; messages par code, test dédié | Confidentialité, RGPD |
| S9 | `oauthScopes` explicites, **sans `script.external_request`** | Aucune donnée vers l'extérieur |
| S10 | Pas de lien public ni de partage hors domaine, vérifié par le script à chaque import | Premier risque de fuite |
| S11 | Aucun identifiant de classeur ni secret dans Git ; TEST et PROD séparés | Fuite par le dépôt |
| S12 | Onglets protégés (modification par le moteur seul) | Garde-fou contre les erreurs ; **pas une sécurité** en option D4-A |

Préalables non techniques aux données réelles : clause « copie d'analyse » (D13), DPA et registre RGPD, durée de conservation (D11).

## 20. Spikes techniques

Prototypes jetables sur données fictives, en environnement TEST, avant de figer l'architecture. Chaque spike produit un rapport d'une page (mesure, verdict, impact).

| # | Question | Critère de sortie |
|---|---|---|
| SP1 | `setValues` avec chaînes commençant par `= + - @` ; effet du format texte ; aller-retour zéros de tête, dates ISO, grands entiers | Stratégie de neutralisation avec relecture identique |
| SP2 | Débit de `Utilities.computeDigest` (100 k / 500 k appels) vs SHA-256 en JS pur ; égalité bit à bit avec Node | Implémentation du port `Hasher`, coût par ligne |
| SP3 | Temps `getValues` / `setValues` par blocs (5 k et 10 k × 30), `deleteRows`, `setNumberFormat` ; comparaison avec le service avancé Sheets | Taille de lot, durée estimée au plafond |
| SP4 | Mémoire : actif + fichier au plafond chargés avec index `Map` | Volume maximal ferme |
| SP5 | CSV de 30–50 Mo : décodage Windows-1252, taille de blob, sha256 sur les octets | Taille maximale de fichier |
| SP6 | Bascule par cellule pointeur vs renommage d'onglets ; protections d'un onglet masqué | Validation du double tampon |
| SP7 | Budget de cellules (2 actifs + STAGING + MOUVEMENTS cumulés) | Plafond par classeur ; empreintes stockées ou recalculées |
| SP8 | Déclencheurs ponctuels : délai réel, quotas Workspace, identité d'exécution | Relance fiable |
| SP9 | `getActiveUser` / `getEffectiveUser` : menu, déclencheur, application web, hors domaine | Source fiable de l'acteur (et faisabilité D4-B) |
| SP10 | Drive partagé : droits, restriction de contenu en lecture seule pour `02_Archive`, édition Workspace requise | Immuabilité du brut, édition à souscrire |
| SP11 | Portées OAuth : `drive` complet ou `drive.file` suffisant | Scopes minimaux |
| SP12 | clasp : 2 projets TEST/PROD, `filePushOrder`, `.clasp.json` par environnement | Procédure de déploiement écrite |

## 21. Tests et critères d'acceptation MVP

### 21.1 Jeux de test (fictifs, résultats attendus écrits avant le code)

Numérotation MVP `Txx`, avec correspondance vers les jeux cibles `JTxx` (§8.1).

| Jeu | Couvre (cible) | Contenu | Résultat attendu |
|---|---|---|---|
| T01 Nominal | JT01, JT19, JT20 | FEC 3 mois, 40 écritures / 120 lignes ; numéros « 000123 », auxiliaires « 0012 » ; libellés `=`, `+`, `@`, `=IMPORTRANGE(…)` | 40 NOUVELLE, 0 A/B/BND ; ΣD = ΣC = valeur notée ; relecture identique, aucune formule évaluée |
| T02 Réimport | JT02, JT02b | Mêmes octets ; puis fichier réordonné en CRLF | REIMPORT_FICHIER ; puis 40 INCHANGÉE |
| T03 Cumulatif M+1 | JT03, 04, 05, 07, 08 | +4 mois ; AC 000045 500 → 550 ; 5 lettrages ; OD 000012 supprimée ; PROV-17 → 000051 ; 1 libellé ; 1 date ; 2 loyers identiques | 1 `M_FOND` (Δ 607000 = +50,00 ; Σ Δ = 0), 5 `M_LET` auto, 1 `M_DESC`, 1 `M_DATE`, 2 ABSENTE (dont PROV-17 avec aide), NOUVELLE = N noté |
| T04 Chevauchement | JT06 | I1 jan–mar, puis I2 mar–avr | 0 ABSENTE en jan–fév |
| T05 Doublon / collision | JT09, JT10 | VT 000124 en 2 blocs identiques ; même numéro, 2 contenus ; même numéro, 2 dates | 1 DOUBLON_INTRA ; IDN_COLLISION (2 cas) |
| T06 Déséquilibre | JT11 | écart de 0,01 € | EQU_ECRITURE + EQU_GLOBAL |
| T07 Encodage / formats | JT12, JT13 | UTF-8, BOM, Windows-1252, double encodage ; `1 234,56` (NBSP), `(12,00)`, `12,00-`, montant + sens | canonique identique à T01 ; STR_ENCODAGE sur le 4e |
| T08 Clôture | JT14 | montant et lettrage modifiés sur 2025 clôturé | PER_CLOTURE (montant) ; info auto (lettrage) |
| T09 Comptes | JT15 | `4011` et `40110` ; compte de 12 car. ; `401DUPONT` ; classe 9 | CPT_COLLISION_PADDING, REJ_LIGNES ×2, CPT_CLASSE |
| T10 Séparation clients | JT18 | même fichier chez A et B ; fichier de A déposé chez B | aucune clé partagée ; CLI_MISMATCH, 0 écriture, quarantaine |
| T11 Grand livre | JT17 (remplacé) | T01 en grand livre trié par compte avec numéro ; variante sans numéro ; puis FEC sur le même exercice ; variante avec ligne « Total compte » | canonique identique à T01 ; refus « exporter le FEC » ; PRF_CHANGEMENT ; REJ_LIGNES ; REC_TOTAL_SAISI détecte un écart volontaire |
| T12 Volume | JT16 | plafond de lignes (§13.2), graine fixe | contrôles identiques au nominal ; durée consignée ; terminé par relances automatiques |
| **T13 Reprise** | §8.3 | panne injectée : milieu d'un lot de normalisation, comparaison, contrôles, publication avant bascule, après bascule avant journal, pendant un retour arrière | actif intact pour toute panne avant bascule ; après reprise : checksum, compteurs, anomalies **identiques** à l'exécution sans panne ; 0 doublon |
| **T14 Retour arrière** | D8 | après T03 publié : annulation ; réimport de T03 ; tentative d'annuler une publication non dernière ou pendant un import | checksum = publication T01 et = tampon inactif ; ABSENTES réactivées ; AC 000045 à 500 ; NOUVELLES retirées ; ANNULATION journalisée ; réimport identique ; 2 refus |
| T15 Validation | §8.3 | publier avec : BND, B non dérogé, A non acquitté, ABSENTE sans décision, staging modifié après validation, motif de 19 caractères | 6 refus motivés |

Reportés : JT08 variante K4, JT17 doublon inter, JT21 à-nouveaux.

### 21.2 Tests unitaires et propriétés (Node)

- `parseMontant` (~20 cas), `parseDate` (29/02, 31/02), `normCompte`, `normTexte`, neutralisation.
- Empreintes : valeurs de référence figées ; 1 centime → empreinte différente ; ordre des lignes indifférent.
- `classer(B, F, perimetre)` : un test par statut, sous-type et case de gravité ; règles de collision.
- Contrôles : un cas qui déclenche et un cas limite qui ne déclenche pas, pour chaque code.
- Machine à états : toute transition interdite lève une erreur.
- **Propriétés** : idempotence `classer(publier(B, F), F)` = 100 % INCHANGÉE ; conservation Σ Δ soldes = 0 ; **`annuler(publier(B, Δ)) = B`** ; **panne après k écritures, pour tout k, puis reprise → même checksum** ; journal technique sans libellé ni montant.

### 21.3 Recette métier (dirigeant, classeur TEST)

1. T01. 2. T03 avec décisions sur les ABSENTES. 3. T02. 4. T06 puis fichier corrigé. 5. Dérogation sur T08. 6. Retour arrière de la dernière publication, puis observation d'une reprise après panne simulée.

### 21.4 Critères d'acceptation du MVP

1. Double import du même fichier : 0 changement, journalisé.
2. Export cumulatif M+1 : exactement N NOUVELLE et K MODIFIÉE ; le lettrage seul n'est jamais compté comme modification de fond.
3. Aucune ABSENTE hors périmètre ; aucune ligne active supprimée sans décision.
4. Réconciliations à 0 centime : écriture, global, fichier = staging relu, actif N = N-1 + mouvements, REC_MIROIR.
5. Publication impossible si une condition de go manque (T15).
6. Reprise après panne à chaque étape : état identique, aucun doublon (T13).
7. Retour arrière : checksum N-1 retrouvé, réimport identique (T14).
8. Fichier d'un autre client rejeté sans aucune écriture (T10).
9. Zéros de tête, dates et montants intacts ; aucune formule évaluée (T01).
10. Volume plafond traité sans intervention manuelle, durée consignée (T12).
11. 0 ligne active orpheline ; aucune donnée comptable dans les journaux techniques.
12. Aucune API Google dans `core/` ni `app/` ; modification manuelle de l'actif détectée (`SYS_ACTIF_ALTERE`).
13. Revue d'un import type en moins de 20 minutes.

## 22. Livrables, lots, estimations et critères go/no-go

Les lots M0–M5 remplacent L0–L6 de la partie A pour le MVP ; L7 (industrialisation) et L8 (API) restent la trajectoire cible.

### 22.1 Livrables indispensables

| # | Livrable | Responsable | Lot |
|---|---|---|---|
| D-01 | Note de cadrage MVP : périmètre, reports, plafond de volume, arbitrages A1–A8 | Directeur des opérations, validée par le dirigeant | M0 |
| D-02 | Spécification des 2 profils (mapping colonne par colonne) | Ingénieur outils financiers | M0 |
| D-03 | Contrat d'interface : modèle canonique, ports, schéma des 7 onglets, machine à états | Architecte | M0 |
| D-04 | Jeux T01–T15 : fichiers CSV et résultats attendus écrits à la main | Ingénieur, contrôlé par le dirigeant | M0 |
| D-05 | Exports pilotes anonymisés (1 FEC + 1 grand livre, ≥ 2 périodes successives), **hors dépôt Git** | Dirigeant | M0 |
| D-06 | 12 rapports de spikes + synthèse go/no-go | Architecte et ingénieur | M1 |
| D-07 | `core/` + `app/`, suite `node:test` avec adaptateurs en mémoire et injection de pannes | Ingénieur | M2 |
| D-08 | `gas/`, CONSOLE (menu, dialogue), gabarit client, procédure de création d'un client | Ingénieur | M3 |
| D-09 | Rapport d'intégration : T01–T15 en TEST, T13 et T14 démontrés, durées mesurées | Ingénieur | M4 |
| D-10 | Check-list sécurité S1–S12 avec une preuve par point | Architecte | M4–M5 |
| D-11 | 4 fiches d'exploitation : import et validation ; reprise ; retour arrière ; création d'un client | Directeur des opérations + ingénieur | M4 |
| D-12 | PV de recette métier signé (§21.3, §21.4) | Dirigeant | M5 |
| D-13 | Procédure de bascule en PROD et revue des accès | Architecte | M5 |
| D-14 | Registre des défauts et bilan du pilote | Directeur des opérations | M5 |

### 22.2 Estimations

Hypothèses : code écrit par les agents Claude Code sous supervision du dirigeant. **(a)** en « jours-session » (une journée de travail d'agent avec ses tests) ; **(b)** temps du dirigeant (pilotage ≈ 0,5 h par jour-session, revues, décisions, recette). Le débogage Apps Script, non reproductible en local (quotas, déclencheurs, consentement OAuth), est le premier facteur de dépassement. Ces estimations sont des ordres de grandeur à recaler après M1.

| Lot | Contenu | (a) jours-session bas / haut | (b) dirigeant h bas / haut | Risques principaux |
|---|---|---|---|---|
| **M0 Cadrage et données de test** | D-01 à D-05, arbitrages, Workspace, questions à l'expert-comptable | 3 / 5 | 10 / 16 | Exports pilotes longs à obtenir/anonymiser ; grand livre pilote sans numéro d'écriture |
| **M1 Spikes** | SP1–SP12, D-06 | 4 / 7 | 5 / 8 | Résultats défavorables (cellules, mémoire, hachage) → reprise d'architecture |
| **M2 Cœur sous Node** | Parsing, normalisation, K2, empreintes, classification, ~25 contrôles, états, lots, reprise, publication et annulation en mémoire | 8 / 12 | 10 / 15 | Cas limites ; résultats attendus erronés ; propriétés difficiles à démontrer |
| **M3 Adaptateurs GAS et CONSOLE** | Drive, archivage, STAGING, CONTROLES, JOURNAL, lots, verrou, relance, quarantaine, triple contrôle, création d'un client | 8 / 13 | 8 / 12 | Quotas, limite de 6 min, conversions Sheets, dialogue HTML |
| **M4 Validation, publication, retour arrière** | Dialogue de revue, check-list, dérogations, décisions, bascule, MOUVEMENTS, annulation, T13–T15, D-09 à D-11 | 7 / 11 | 8 / 12 | Atomicité réelle, reprise idempotente, reconstruction exacte |
| **M5 Recette, PROD, pilote** | Recette, environnement PROD, 3 cycles rejoués + 1 cycle réel, corrections | 4 / 7 | 16 / 24 | Formats réels non couverts ; saison de clôture |
| **Sous-total** | | **34 / 55** | **57 / 87** | |
| **Marge imprévus (+25 %)** | hors lots, consommée sur décision | +9 / +14 | +14 / +22 | |
| **Total réaliste** | | **≈ 43 / 69** | **≈ 71 / 109 h** | |

**Règle d'arrêt** (D12) : un lot qui dépasse sa borne haute de plus de 30 % déclenche une revue go/no-go par le dirigeant.

### 22.3 Critères go/no-go par lot

| Lot | Go si | No-go / reprise si |
|---|---|---|
| M0 | A1–A8 tranchés ; 2 profils spécifiés ; T01–T15 avec résultats attendus contrôlés ; chaque règle et contrôle couverts par ≥ 1 cas ; Workspace souscrit ou date ferme ; exports pilotes anonymisés disponibles ; questions envoyées à l'expert-comptable | Grand livre pilote sans numéro d'écriture et pas de FEC : changer de client pilote |
| M1 | 12 rapports ; plafond de volume fixé ; aller-retour Sheets sans altération ; injection neutralisée ; bascule par pointeur atomique ; scopes sans `external_request` ; option D4 retenue pour le fictif | Bascule non atomique, ou volume pilote > plafond sans contournement : retour à l'architecte |
| M2 | 100 % des tests Node au vert sur T01–T15 (hors partie volume de T12) ; idempotence et `annuler(publier(B)) = B` vérifiées ; chaque contrôle a un cas déclenchant et un cas limite ; aucune API Google dans `core/`/`app/` | Écart attendu/obtenu non expliqué |
| M3 | Client fictif créé en < 15 min ; T01, T02 et aller-retour conformes en GAS ; fichier d'un autre client en quarantaine sans écriture ; reprise après interruption d'un lot ; aucune formule dans le classeur client ; `JOURNAL_TECH` sans donnée comptable | Fuite dans les logs ou écriture chez le mauvais client : **arrêt immédiat** |
| M4 | Publication impossible avec bloquant ouvert ou staging modifié ; T13 identique au checksum près à chaque étape ; T14 = checksum N-1 ; T15 conforme ; volume plafond traité sans intervention ; S1–S12 vérifiés en TEST | Une seule corruption non détectée : pas de passage en M5 |
| M5 | PV signé (13 critères) ; PROD sur Workspace avec D4 tranché ; partage contrôlé ; 3 cycles rejoués + 1 réel sans incident bloquant dû à l'outil ; revue < 20 min ; points expert-comptable traités | Arrêt ou suite décidés par le dirigeant si le gain n'est pas démontré |

## 23. Planning

**Hypothèse de base** : le dirigeant consacre **1 jour par semaine (≈ 7 h)** ; démarrage lundi 12/10/2026 (S1). Les agents avancent de 3 à 4 jours-session entre deux séances : c'est le temps du dirigeant qui fixe le rythme.

| Semaines | Lot | Jalon de décision |
|---|---|---|
| S1–S2 (12/10–23/10) | M0 ; souscription Workspace et questions à l'expert-comptable en S1 | **J0** (fin S2) : go spikes |
| S3–S5 (26/10–13/11) | M1 ; début de la partie de M2 indépendante des spikes dès S4 | **J1** (fin S5) : architecture figée, plafond de volume, D4 pour le fictif |
| S5–S8 (09/11–04/12) | M2 | **J2** (fin S8) : cœur validé |
| S9–S11 (07/12–08/01, coupure de fin d'année incluse) | M3 | **J3** (fin S11) : import → staging fiable |
| S12–S15 (11/01–05/02) | M4 | **J4** (fin S15) : **go données réelles** — Workspace en place, D4 tranché, réponses de l'expert-comptable reçues, S1–S12 cochés, clause et DPA signés |
| S16–S18 (08/02–26/02) | M5 : recette, PROD, cycles rejoués | |
| S19–S21 (01/03–19/03) | Cycle réel à la clôture mensuelle suivante ; marge | **J5** (≈ mi-mars 2027) : go ou arrêt pour la V1.1 |

**Sensibilité à la disponibilité du dirigeant**

| Disponibilité | Durée estimée | Remarque |
|---|---|---|
| 0,5 jour / semaine | 32–40 semaines | Pilote en pleine saison de clôture ; perte de contexte entre séances |
| **1 jour / semaine** | **18–22 semaines** (fin février – mi-mars 2027) | Base |
| 2 jours / semaine | 11–14 semaines (≈ janvier 2027) | Le développement redevient le facteur limitant |

**Dépendances bloquantes** : Workspace souscrit au plus tard fin S2 ; exports pilotes anonymisés fin S2 (profils) ; réponses de l'expert-comptable avant J4 ; accord des clients pilotes, clause « copie d'analyse » et DPA avant J4.

**Saison de clôture** (janvier–avril) : si la disponibilité du dirigeant baisse, décaler M5 après la saison plutôt que faire une recette au rabais.

## 24. Fonctionnalités reportées

| Fonctionnalité | Horizon | Repli sûr pendant le report |
|---|---|---|
| Détection automatique encodage / séparateur / format de date | V1.1 | Imposés par le profil ; écart → bloquant |
| Scission collectif/auxiliaire, lignes parasites | V1.1 | Ligne rejetée → import bloqué |
| Autres profils grand livre | V1.1 | Exiger le FEC |
| Clés K3/K4 (grand livre sans numéro) | V1.1 / V2 | Import refusé |
| RENUMÉROTÉE | V1.1 | ABSENTE + NOUVELLE avec aide à la décision |
| DOUBLON_INTER | V1.1 | Un seul type de profil par exercice (`PRF_CHANGEMENT`) |
| JUMELLE, RAPPROCHEMENT_PROBABLE | V2 | Sans objet en K2 |
| Appariement ligne à ligne | V2 | Version à l'écriture entière |
| CPT_INCONNU (+ `REFERENTIELS`), EQU_AN | V1.1 | Revue visuelle, check-list |
| Autres contrôles reportés (§17) | V2 | Contrôles essentiels maintenus |
| `RAW_LIGNES` | V1.1 si besoin | Fichier archivé + sha256 + rang source |
| Bail de verrou par client, parallélisme | V1.1 | Verrou global, un import à la fois |
| Retour arrière multi-niveaux | V2 | Dernier import ; au-delà, réimport depuis les bruts |
| Publication partielle | V2 | Tout ou rien |
| Double regard préparateur ≠ valideur | Dès un 2e utilisateur | Deux actions journalisées + check-list |
| Drive partagé par client, revue des accès complète | Dès un 2e utilisateur | Drive par environnement, contrôle S10 |
| Tableau de bord riche | V1.1 | `SYNTHESE` en valeurs |
| Identité technique B, compte de service | Avant 2e utilisateur / application cible | Option A + détection par checksum |
| Archives par exercice | V1.1 | Plafond de volume ferme |
| Accès du client final | V2 | Aucun accès |
| Connecteurs API, base cible | Application cible (L8) | Import CSV |
| Industrialisation (nouveau client < 1 h, guide d'ajout de format) | V1.1 (L7) | Procédure manuelle D-11 |

## 25. Arbitrages restant à faire

### 25.1 Priorité 1 — bloquent le démarrage (avant fin S1)

| # | Question | Recommandation |
|---|---|---|
| P1 | Souscrire Workspace **dès M0** et y loger aussi l'environnement TEST (données fictives) ? | **Oui** : les Drive partagés n'existent pas sur un compte personnel, et SP8–SP11 ne sont représentatifs que sur Workspace. Précise D3 sans le contredire. Dépense à valider |
| P2 | Client(s) pilote(s) et logiciel du profil grand livre | 1 à 2 clients ; vérifier que l'export grand livre est **tabulaire** et contient un **numéro d'écriture** |
| P3 | A1 — grand livre sans numéro d'écriture | Refuser, exiger le FEC |
| P4 | A2 — ligne rejetée | Bloquant non dérogeable |
| P5 | A3 — lignes parasites du grand livre | Exiger un export tabulaire propre |
| P6 | A4 — changement de source sur un exercice déjà alimenté | Bloquant au MVP |
| P7 | A5 — reconduction des dérogations sur objet inchangé | Oui, automatique et tracée |
| P8 | A6 — total du logiciel saisi par l'opérateur | Obligatoire pour le grand livre, facultatif pour le FEC |
| P9 | A7 — validation différée imposée quand le dirigeant est seul | Non : deux actions distinctes + check-list (remplace D10 pour le MVP) |
| P10 | A8 — version à l'écriture entière | Oui |
| P11 | Enveloppe de temps globale et par lot, marge de 25 %, règle d'arrêt (D12) | Accepter §22.2 |
| P12 | Disponibilité du dirigeant | 1 jour / semaine |
| P13 | Qui répond aux points [V-EC] | L'expert-comptable externe du cabinet (inscrit à l'Ordre) |

### 25.2 Priorité 2 — pendant M0–M1 (techniques)

| # | Question | Recommandation |
|---|---|---|
| T1 | Bundler ou non | Sans bundler ; esbuild au-delà de ~15 fichiers |
| T2 | Bascule par pointeur ou renommage d'onglets | Pointeur à une cellule, sous réserve de SP6 |
| T3 | Hachage natif ou JS pur | Le plus rapide **à égalité bit à bit avec Node** (SP2) |
| T4 | Empreintes stockées ou recalculées | Stockées si le budget de cellules le permet (SP7) |
| T5 | Plafond de volume par classeur | 50 000 lignes actives, ajusté par SP4/SP5/SP7 ; refus explicite au-delà |
| T6 | Interface : menu + dialogue ou application web | Menu en option A ; application web seulement si D4-B |
| T7 | Drive partagé par environnement ou par client | Par environnement au MVP |
| T8 | `RAW_LIGNES` | Reporté |
| T9 | Verrou global ou bail par client | Verrou global |
| T10 | Profondeur d'annulation | Un niveau |
| T11 | D4 — identité technique | A sur fictif, spike B en parallèle, choix définitif à J4 |
| T12 | Longueur de compte `L` par client pilote (D18) | Fixée à la création du client |
| T13 | Agent QA dédié | Optionnel ; sinon le dirigeant contrôle les résultats attendus (≈ 4 h en M0) |

### 25.3 Priorité 3 — avant J4 (données réelles)

- Clause « copie d'analyse » relue par un juriste (D13), DPA Workspace, registre RGPD.
- Durée de conservation des bruts et historiques (D11), sur avis d'un professionnel habilité.
- Valeurs initiales des seuils, calibrées sur les cycles rejoués (D7).

### 25.4 Points à valider par un expert-comptable [V-EC]

1. Une écriture n'a qu'une seule `EcritureDate` dans le FEC (date multiple sous un même numéro = collision).
2. Traitement des montants négatifs en colonne débit ou crédit.
3. Gravité d'une modification de fond sur une écriture validée (avertissement ou bloquant).
4. `valid_date` vide signifie-t-il « brouillard » selon les logiciels ?
5. Comptes de classe 9 ; nouvelles écritures sur exercice clôturé.
6. Règle de padding des comptes et longueur `L`.
7. Champs FEC dont l'absence est tolérable en lecture.
8. Durée de conservation (avec le volet RGPD).

### 25.5 Priorité 4 — à J5

Lancement de la V1.1 et ses priorités (autre format, RENUMÉROTÉE, CPT_INCONNU), date de la trajectoire API.
