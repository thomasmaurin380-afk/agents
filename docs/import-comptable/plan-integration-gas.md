# Plan minimal d'intégration Google Sheets / Apps Script

| | |
|---|---|
| Version | 0.1 — 2026-10-09 |
| Statut | **Préparé, rien n'est déployé.** Aucun classeur, aucun fichier Drive, aucun projet Apps Script n'a été créé ni connecté |
| Branche | `claude/import-comptable-prototype` (non fusionnée dans `main`) |
| Références | Cahier des charges §13–§20 (architecture MVP, spikes), contrat d'interface v0.2, `resultats-tests.md` |

## 1. Principe : intégrer par paliers, du moins exposé au plus exposé

Chaque palier n'utilise que des **données fictives**. Il demande le minimum d'autorisations et doit réussir avant que le suivant commence. Aucun palier ne touche un classeur client réel. Les données réelles restent soumises au jalon J4 : Workspace souscrit, compte technique décidé (D4), avis de l'expert-comptable, DPA et clause « copie d'analyse ».

| Palier | Objet | Autorisations OAuth | Données | Crée ou modifie |
|---|---|---|---|---|
| **G0 — Premier test fictif** (préparé) | Le cœur tourne-t-il dans le V8 d'Apps Script avec `Utilities.computeDigest`, et donne-t-il **exactement** les mêmes résultats que sous Node ? | **Aucune** (`oauthScopes: []`) | S01 et S03 fictifs, embarqués dans le script | Rien, en dehors du projet de test lui-même |
| G1 — Aller-retour Sheets (SP1, SP3, SP6, SP7) | Neutralisation des formules, zéros de tête, dates, entiers ; temps de lecture et d'écriture par lots ; bascule par cellule pointeur ; budget de cellules | `spreadsheets.currentonly` (script lié à **un classeur de test vierge**) [À VÉRIFIER] | Fictives | Un classeur de test vierge, créé à la main |
| G2 — Volume et quotas (SP2, SP4, SP8) | Coût du hachage, mémoire, déclencheurs de relance, durée maximale | Celles de G1 + `script.scriptapp` (déclencheurs) | 20 000 à 50 000 lignes générées | Le classeur de test |
| G3 — Drive et identité (SP5, SP9, SP10, SP11) | Lecture d'un CSV déposé, décodage windows-1252 natif, `getActiveUser`, Drive partagé, scopes minimaux | `drive.readonly` ou `drive.file` [À VÉRIFIER] | Fichiers fictifs déposés dans un dossier de test | Un dossier de test |
| G4 — Adaptateurs et CONSOLE | Onglets MVP, double tampon, journal, reprise par lots (T13 de bout en bout) | Selon G1 à G3 | Fictives | Classeur client de test `CLI-TEST` |

## 2. Palier G0 : premier test sur données fictives (prêt à exécuter)

### 2.1 Ce qui est livré

| Élément | Emplacement | Rôle |
|---|---|---|
| Manifeste | `import-comptable/gas/appsscript.json` | V8, fuseau Europe/Paris, `oauthScopes: []`. Aucune autorisation n'est demandée à l'exécution |
| Adaptateur de hachage | `import-comptable/gas/HasherGas.js` | `Utilities.computeDigest` (UTF-8), avec conversion des octets **signés** en hexadécimal |
| Test | `import-comptable/gas/TestFictif.js` | `testPrototypeFictif()` : vérifie le Hasher avec les vecteurs de référence, puis enchaîne S01 → publication → S03 → publication → annulation, et compare le résultat aux valeurs obtenues sous Node |
| Assemblage | `import-comptable/scripts/construire-gas.js` | Produit `dist/gas/` : le cœur dans l'ordre de `ordre.json`, l'adaptateur, le test, `JeuxFictifs.js` (S01 et S03 **fictifs**, plus les valeurs Node attendues), et `.clasp.json.exemple` avec `filePushOrder` et **sans identifiant de projet** |
| Vérification locale | `import-comptable/test/gas.test.js` | Exécute le paquet dans un Apps Script **simulé** (vm Node, octets signés) : même résultat que Node. Un Hasher qui omettrait la conversion des octets signés est rejeté. Le paquet ne contient aucun appel à SpreadsheetApp, DriveApp, UrlFetchApp, PropertiesService, Session… |

### 2.2 Procédure (actions humaines, sur un compte Google de test)

À exécuter **uniquement après votre feu vert**. Un compte Google personnel suffit : Workspace n'est pas requis pour des données fictives, conformément à votre arbitrage.

1. `cd import-comptable && node scripts/construire-gas.js` : assemble `dist/gas/`, sans rien déployer.
2. Créer, dans le compte de test, un **projet Apps Script autonome** vide, nommé par exemple « IMPORT-TEST-G0 ». Il ne doit être lié à aucun classeur.
3. Copier les 15 fichiers `.js` de `dist/gas/` dans le projet en respectant leur ordre numéroté, puis remplacer le manifeste par `dist/gas/appsscript.json`. On peut aussi utiliser `clasp` : copier `.clasp.json.exemple` en `.clasp.json` **localement**, sans le versionner, y renseigner l'identifiant du projet de test, puis exécuter `clasp push`.
4. Exécuter `testPrototypeFictif`. **Aucun écran d'autorisation ne doit apparaître.** S'il en apparaît un, arrêter et le signaler.
5. Relever le journal d'exécution : `ok`, `ecarts`, `duree_ms`. Il ne contient que des codes, des compteurs et des empreintes.

### 2.3 Critères de réussite de G0

| # | Critère | Ce qu'il prouve |
|---|---|---|
| G0-1 | Aucune demande d'autorisation | Le paquet n'accède à aucune donnée Google |
| G0-2 | `Empreinte.verifierHasher(HasherGas)` passe | `computeDigest` UTF-8 est égal bit à bit aux vecteurs calculés hors Node (SP2, partie fonctionnelle) |
| G0-3 | `ok: true`, `ecarts: []` | Statuts S01/S03, anomalies, checksums des publications 1 et 2, et checksum après annulation **identiques** à Node : le cœur est portable (SP12) |
| G0-4 | `duree_ms` relevée | Première mesure réelle du cœur dans Apps Script (≈ 90 lignes fictives : S01 puis S03), à comparer au même cycle sous Node |

Un échec de G0-2 ou G0-3 **bloque** G1 : il faut corriger le cœur ou l'adaptateur et rejouer G0.

## 3. Paliers suivants (à préparer après G0)

- **G1** : script lié à un classeur de test vierge.
  - SP1 : écrire puis relire les lignes canoniques de S01, y compris les libellés `=`, `+`, `@` et `=IMPORTRANGE(...)`, puis comparer les empreintes avant et après. **C'est le test d'aller-retour qui manque à REC_TOTAUX** (contrôle C9).
  - SP6 : bascule de la cellule pointeur `ACTIF_A` / `ACTIF_B`.
  - SP3 et SP7 : temps de lecture et d'écriture par lots, budget de cellules.
- **G2** : hachage et classification de 20 000 à 50 000 lignes générées ; découpage en lots de 4 min 30 avec point de reprise ; déclencheur de relance ; injection de panne entre deux lots (T13 réel).
- **G3** : dépôt de fichiers fictifs dans un dossier de test ; décodage `getDataAsString('windows-1252')`, à comparer au décodeur explicite de Node (le défaut du TextDecoder de Node a été constaté à l'étape 1) ; `getActiveUser` / `getEffectiveUser` ; scopes minimaux.
- **G4** : adaptateurs `gas/` (onglets CONFIG, IMPORTS, JOURNAL, STAGING, CONTROLES, ACTIF_A/B, MOUVEMENTS) et CONSOLE, sur le client fictif `CLI-TEST`.

## 4. Règles de sécurité de l'intégration

1. Aucun identifiant de projet, de classeur ou de dossier dans Git : `.clasp.json` reste local, seul `.clasp.json.exemple` est fourni, et `dist/` est ignoré.
2. Aucun accès réseau sortant : le manifeste ne déclare jamais `script.external_request` (S9).
3. Le journal d'exécution ne contient aucun libellé, montant ni nom de fichier client. Le test G0 le vérifie sous Node.
4. Scopes ajoutés palier par palier, chacun justifié, documenté et validé avant usage.
5. Projets de test distincts du futur projet de production. Aucun déploiement « exécutable » (application web) avant la décision D4.
6. Avant toute donnée réelle : Workspace, décision D4 (compte technique), DPA, clause « copie d'analyse », réponses de l'expert-comptable (jalon J4).
