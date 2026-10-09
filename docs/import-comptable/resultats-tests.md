# Résultats des tests — prototype local de l'import comptable

| | |
|---|---|
| Version | 0.2 — 2026-10-09 (0.1 : étape 1 ; 0.2 : arbitrages P1–P7, résolution des écarts du contrat, préparation Apps Script) |
| Branche | `claude/import-comptable-prototype` (non fusionnée dans `main`) |
| Environnement | Node.js v22.22.0, Linux ; `node:test` ; **aucune dépendance npm** ; Python 3 pour la référence indépendante des empreintes |
| Données | **100 % fictives** (`CLI-TEST`, `CLI-UNIT`, SIREN fictifs). Aucune donnée client, aucun classeur, aucun appel réseau, aucun déploiement |
| Commandes | `cd import-comptable && npm test` · `node scripts/rapport-scenarios.js` · `python3 -I scripts/empreintes_reference.py` · `python3 -I test/fixtures/generateur/verifier_fixtures.py` · `node scripts/construire-gas.js` |
| Résultat | **79 tests, 79 réussis, 0 échec, 0 ignoré** (≈ 10 s). Contrôle des jeux de l'ingénieur : **TOUT CONFORME** |

> Ces tests valident le cœur en JavaScript pur **sous Node**, et dans un Apps Script **simulé**. Ils ne prouvent rien sur l'exécution réelle dans Google Apps Script ni dans Google Sheets : c'est l'objet du palier G0 et des suivants (`plan-integration-gas.md`).

## 1. Synthèse par suite

| Fichier | Tests | Réussis | Ce qui est vérifié |
|---|---|---|---|
| `architecture.test.js` | 8 | 8 | Ni API Node ni API Google dans le cœur ; **aucun caractère invisible littéral dans le code** ; déterminisme et syntaxe ES2019 ; `ordre.json` complet et sans dépendance vers un module chargé plus tard ; **contrôles A6 sans parseMontant ni parseDate** ; **erreurs de contrat sans donnée** ; cœur chargé dans un espace global vierge (simulation d'Apps Script), avec un résultat identique à Node |
| `csv-normalisation.test.js` | 15 | 15 | CSV RFC 4180 ; montants (dont **P7 : décimales nulles acceptées, sans arrondi**) ; dates ; comptes ; texte ; encodage ; neutralisation ; décodage windows-1252 ; **validation du Hasher** (vecteurs calculés hors Node, Hasher invalide refusé) ; **sérialisation des empreintes au format du contrat** ; **P3 : montant négatif conservé dans sa colonne** |
| `comparaison-publication.test.js` | 22 | 22 | Classification, doublons, collisions, chevauchement ; T15 (refus cumulés `PUB_*`) ; A7 (staging, décisions, version, checksum) ; **A5/P1** (reconduction) ; **P2** (total absent, jamais reconduit) ; **P5** (ABSENTE sur exercice clôturé) ; **P4** (réapparition) ; réimport ; retour arrière et tampon inactif ; altération ; A4/A1 ; **P6** (identité sans le seul nom) ; isolation ; A6 ; restitution des contrôles et des variations ; empreinte de dérogation ; décisions ; check-list et horodatages |
| `proprietes.test.js` | 9 | 9 | 60 jeux aléatoires reproductibles par propriété (§3), dont **non-mutation sur entrées gelées en profondeur** |
| `scenarios.test.js` | 23 | 23 | Les 22 cas de l'ingénieur (§2) et l'**égalité des empreintes avec l'implémentation Python indépendante** |
| `gas.test.js` | 2 | 2 | Paquet Apps Script du premier test : ordre, aucun scope OAuth, aucun appel de données ; exécution simulée identique à Node ; un Hasher qui omettrait la conversion des octets signés est rejeté |
| **Total** | **79** | **79** | |

## 2. Scénarios fictifs : attendu (ingénieur) contre obtenu (moteur)

Tableau produit par `node scripts/rapport-scenarios.js` :

| Scénario | Résultat | Statut import | Lignes lues / importées / rejetées / doublons | Statuts obtenus | Anomalies A/B/BND obtenues | Écarts |
|---|---|---|---|---|---|---|
| S01 | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S02a | conforme | REIMPORT_FICHIER | non lu | — | — | 0 |
| S02b | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S03 | conforme | ANALYSE | 53 / 50 / 0 / 3 | NOUVELLE 7, INCHANGEE 4, MODIFIEE 8, ABSENTE 2, DOUBLON_INTRA 1 | IDN_ABSENTE (A), IDN_ABSENTE (A), IDN_DOUBLON_INTRA (A), IDN_MOD_FOND (A), IDN_MOD_FOND (A), VOL_SUPPR_MASSE (B) | 0 |
| S04 | conforme | ANALYSE | 18 / 17 / 0 / 0 | NOUVELLE 2, INCHANGEE 4 | — | 0 |
| S05 | conforme | REJETE (bloqué) | 11 / 11 / 0 / 0 | NOUVELLE 1, COLLISION 2 | IDN_COLLISION (BND), IDN_COLLISION (BND) | 0 |
| S06 | conforme | REJETE (bloqué) | 8 / 8 / 0 / 0 | NOUVELLE 3 | EQU_ECRITURE (B), EQU_GLOBAL (BND) | 0 |
| S07a | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S07b | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S07c | conforme | REJETE (bloqué) | 36 / 0 / 36 / 0 | — | STR_ENCODAGE (BND) | 0 |
| S07d | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S08 | conforme | ANALYSE | 10 / 10 / 0 / 0 | INCHANGEE 1, MODIFIEE 3 | IDN_MOD_FOND (A), PER_CLOTURE (B) | 0 |
| S09 | conforme | REJETE (bloqué) | 10 / 8 / 2 / 0 | NOUVELLE 3 | CPT_CLASSE (B), CPT_COLLISION_PADDING (BND), REJ_LIGNES (BND) | 0 |
| S10a | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S10b | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S10c | conforme | REJETE (bloqué) | non lu | — | CLI_MISMATCH (BND) | 0 |
| S11a | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S11b1 | conforme | REJETE (bloqué) | 36 / 0 / 36 / 0 | — | STR_ENTETE (BND) | 0 |
| S11b2 | conforme | REJETE (bloqué) | 36 / 0 / 36 / 0 |  | REJ_LIGNES (BND) | 0 |
| S11c | conforme | REJETE (bloqué) | 37 / 36 / 1 / 0 | NOUVELLE 14 | REJ_LIGNES (BND) | 0 |
| S11d | conforme | REJETE (bloqué) | non lu | — | PRF_CHANGEMENT (BND) | 0 |
| S11e | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | REC_TOTAL_SAISI (B) | 0 |

### 2.1 Non-régression après les nouvelles règles

Les nouvelles règles ont été appliquées sans réécrire les attendus. Les scénarios ont ensuite été rejoués :

| Règle | Effet attendu sur les scénarios | Constat |
|---|---|---|
| P1, P2, P4, P5, P7 | Aucun scénario existant n'est concerné ; tests unitaires dédiés | 22/22 inchangés |
| P6 (identité) | Les FEC sont confirmés par le dossier de dépôt (simulé) ; S10c reste en `CLI_MISMATCH` (SIREN du nom contradictoire), contrôlé avant le réimport | 22/22 inchangés |
| E5 (en-tête sensible à la casse), CHP_VIDE (débit et crédit vides) | Aucun fichier n'est touché (vérifié : aucune ligne n'a le débit et le crédit vides tous les deux) | 22/22 inchangés |
| **P3** (montants négatifs conservés) | **S11a, S11c, S11e** : deux montants négatifs (`25,00-` au débit, `(25,00)` au crédit) restent dans leur colonne, donc les totaux de colonnes passent de 1 622 500 à **1 617 500** | **3 écarts au premier passage, tous dus à P3.** Le nouveau total a été recalculé **indépendamment** (Python, décimal, fichier brut), puis les attendus ont été mis à jour avec une note `maj_p3` : totaux, total saisi (même convention), et comparaison avec S01 sur le montant signé. L'écart volontaire de 1,00 € de S11e est conservé |
| E18 (rangs physiques) | Rangs des attendus +1 (note `convention_rang`) ; générateur aligné | Régénération identique à l'octet près ; `verifier_fixtures.py` : TOUT CONFORME |

**Aucune autre valeur attendue n'a été modifiée.**

## 3. Tests de propriétés

Générateur pseudo-aléatoire à graine fixe (mulberry32) : tout échec se rejoue à l'identique.

| Propriété | Énoncé | Jeux | Résultat |
|---|---|---|---|
| Comparaison | Statut obtenu = statut construit (montant, compte, lettrage, libellé, date, suppression, ajouts, inchangées) | 60 | 60/60 |
| Idempotence 1 | Réimport réordonné en CRLF : 100 % INCHANGEE, 0 anomalie, 0 variation, publication sans mouvement | 60 | 60/60 |
| Idempotence 2 | `classer(publier(B, F), F)` = 100 % INCHANGEE | 60 | 60/60 |
| Intégrité | Σ des variations = 0 ; aucun REC_* parasite ; actif équilibré et traçable | 60 | 60/60 |
| Retour arrière | `annuler(publier(B, Δ))` = B (checksum et champs), tampon inactif vérifié | 60 | 60/60 |
| Premier import annulé | Actif vide | 1 | 1/1 |
| Déterminisme | Mêmes entrées, mêmes sorties ; l'ordre des écritures est sans effet | 60 | 60/60 |
| Isolation | Clés disjointes entre deux clients | 1 | 1/1 |
| **Non-mutation** | Analyse, validation, publication et annulation sur **entrées gelées en profondeur** (toute écriture lèverait une exception) ; état d'entrée identique après le cycle | 60 | 60/60 |

## 4. Empreintes : harmonisation avant persistance

- **Format** : exactement celui du contrat §5 (`H`, `Coll`, noms de famille, 36 champs de `hLigne`, checksum de l'actif).
- **Vérification indépendante** : `scripts/empreintes_reference.py` réimplémente le §5 en Python, sans lire le code JavaScript. Ses résultats sur S01 (`h_fond`, `h_desc` et `h_let` des 36 lignes ; `h_ecr` des 14 écritures) sont **identiques bit à bit** à ceux du moteur.
- **Hasher** : deux vecteurs de référence calculés avec `sha256sum` et Python hashlib, dont un texte non ASCII (É, —, espace insécable, €). Ils sont vérifiés à chaque cas d'usage, et tout Hasher non conforme est refusé (`HASHER_INVALIDE`).
- **Statut** : le format est **figé en `v1`**. Toute évolution exigera un nouveau préfixe de version et une migration.

## 5. Défauts trouvés pendant cette étape

| # | Constat | Cause | Correction |
|---|---|---|---|
| D8 | Vecteur non ASCII du Hasher refusé au premier essai | La valeur de référence avait été calculée avec une espace normale, alors que la chaîne testée contient une espace insécable | Valeur recalculée en Python sur la chaîne exacte |
| D9 | Caractères invisibles littéraux (espaces insécables, BOM) introduits dans le code par l'outil d'écriture | Outil | Remplacés par des séquences `\uXXXX` ; nouveau test d'architecture qui refuse tout caractère invisible littéral (vérifié sur espace insécable, espace fine, BOM et U+2028) |
| D10 | Script de mesure de volume encore sur l'ancienne signature de `publier` | Oubli lors de la refonte | Corrigé ; mesures refaites (§6) |
| D11 | Test Apps Script simulé en échec alors que les résultats étaient égaux | Comparaison stricte d'objets créés dans un autre « realm » (vm) | Comparaison des valeurs sérialisées |

Aucun défaut du moteur n'a été révélé par les scénarios de l'ingénieur à cette étape. Les 3 écarts du premier passage relevaient uniquement de la nouvelle règle P3 (§2.1).

## 6. Mesure de volume (indicative, Node local)

```
FEC fictif : 5000 écritures, 15133 lignes
Analyse import 1 (base vide)              1572 ms
Validation + publication 1                1166 ms
Analyse import 2 (cumulatif modifié)      1388 ms
  statuts : {"NOUVELLE":0,"INCHANGEE":4891,"MODIFIEE":99,"ABSENTE":10,"COLLISION":0,"DOUBLON_INTRA":0,"REIMPORT_FICHIER":0}
Validation + publication 2                 577 ms
Annulation publication 2                   264 ms

FEC fictif : 20000 écritures, 60123 lignes
Analyse import 1 (base vide)             12441 ms
Validation + publication 1                4957 ms
Analyse import 2 (cumulatif modifié)      9991 ms
  statuts : {"NOUVELLE":0,"INCHANGEE":19591,"MODIFIEE":399,"ABSENTE":10,"COLLISION":0,"DOUBLON_INTRA":0,"REIMPORT_FICHIER":0}
Validation + publication 2                2605 ms
Annulation publication 2                   892 ms
```

L'analyse est **plus lente qu'à l'étape 1** (≈ 12 s contre ≈ 7 s pour 60 000 lignes). La cause en est le format d'empreintes du contrat (chaînes plus longues), l'empreinte de staging et la preuve de réversibilité calculée avant chaque publication. Sous Node, l'ordre de grandeur reste linéaire. **Dans Apps Script, le coût du hachage (`computeDigest` par ligne et par famille d'empreintes) est le principal risque de dépassement des 6 minutes** : à mesurer en G0 puis en G2 (SP2).

## 7. Limitations connues

| # | Limitation | Suite prévue |
|---|---|---|
| L1 | Aucune exécution réelle dans Apps Script ni dans Sheets : seulement une simulation | Palier G0 (prêt), puis G1–G4 |
| L2 | T13 (reprise après interruption entre deux lots) non couvert : pas encore de machine à états `IMPORTS` ni de lots. Seule garantie actuelle : une publication refusée ou interrompue ne modifie rien, et la rejouer donne le même résultat | G2 et G4 |
| L3 | Statut d'anomalie entre imports (OUVERTE → RÉSOLUE) non persisté | G4 |
| L4 | Règles [V-EC] à faire valider : P3 (montants négatifs), classe 9, une seule date par écriture, écriture validée modifiée | Expert-comptable |
| L5 | Migration contrôlée GL ↔ FEC (A4) spécifiée, non implémentée | V1.1 |
| L6 | Format grand livre fictif ; aucun export réel | Exports pilotes anonymisés |
| L7 | Performance du hachage dans Apps Script inconnue | G0 (premier relevé), G2 (volume) |
