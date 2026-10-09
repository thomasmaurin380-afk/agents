# Résultats des tests — prototype local de l'import comptable (étape 1)

| | |
|---|---|
| Date d'exécution | 2026-10-09 |
| Branche | `claude/import-comptable-prototype` (créée depuis `main`, non fusionnée) |
| Environnement | Node.js v22.22.0, Linux, 4 cœurs ; `node:test` intégré ; **aucune dépendance npm** |
| Données | **100 % fictives** (`CLI-TEST`, `CLI-UNIT`, SIREN fictifs) ; aucune donnée client, aucun appel réseau, aucune API |
| Commandes | `cd import-comptable && npm test` · `node scripts/rapport-scenarios.js` · `node scripts/mesure-volume.js 20000` |
| Résultat | **61 tests, 61 réussis, 0 échec, 0 ignoré** (durée ≈ 14 s, dont ≈ 13 s pour les tests de propriétés) |

> Ces tests valident le **cœur métier en JavaScript pur, exécuté sous Node**. Ils ne disent rien du comportement dans Google Sheets ni dans Apps Script : ni lots, ni quotas, ni conversions de cellules, ni reprise après interruption d'exécution. Ces points relèvent des spikes et de l'étape d'intégration.

## 1. Synthèse par suite

| Fichier | Tests | Réussis | Ce qui est vérifié |
|---|---|---|---|
| `test/architecture.test.js` | 4 | 4 | Le cœur (`src/core`, `src/app`) n'appelle aucune API Node ou Google. Pas de `Date`, de `Math.random` ni de `console`. Syntaxe ES2019. Tous les fichiers figurent dans l'ordre de chargement. **Le cœur chargé dans un espace global vierge, sans `require` (simulation d'Apps Script), produit un résultat identique à Node.** |
| `test/csv-normalisation.test.js` | 11 | 11 | CSV RFC 4180 (guillemets, retours à la ligne dans un champ, CRLF, BOM, lignes vides). Montants en centimes, avec 14 formats admis et 6 rejets explicites. Dates (bissextiles, dates inexistantes). Comptes (padding, pas de troncature). Texte (NFC, espaces insécables). Détection du double encodage. Neutralisation des formules. **Décodage windows-1252.** |
| `test/comparaison-publication.test.js` | 16 | 16 | Classification et sous-types. Doublons et collisions. Chevauchement de périodes. **T15** (refus cumulés). **A7** (staging, checksum et version). **A5** (reconduction). Suppression logique et réapparition. Réimport. **Retour arrière.** Altération de l'actif. Exercice clôturé. **A4** et **A1**. Isolation entre clients. **A6**. |
| `test/proprietes.test.js` | 8 | 8 | Propriétés vérifiées sur des **jeux aléatoires à graine fixe**, donc reproductibles : 60 jeux par propriété, 30 écritures de base, 6 types de mutation et des ajouts. Détail au §3. |
| `test/scenarios.test.js` | 22 | 22 | Les 22 cas des 11 scénarios de l'ingénieur outils financiers. Les résultats attendus ont été écrits à la main, **indépendamment du code**. Détail au §2. |
| **Total** | **61** | **61** | |

## 2. Scénarios fictifs : attendu (ingénieur) contre obtenu (moteur)

Les résultats attendus figurent dans `import-comptable/test/fixtures/attendus/` ; la méthode est décrite dans `jeux-de-test.md`. Pour chaque cas, l'outil de comparaison (`test/scenarios-lib.js`) confronte :
- le blocage, le statut de l'import et les compteurs de lignes ;
- les totaux importés et les totaux du fichier ;
- le nombre d'écritures par statut et par sous-type, et le statut de chaque écriture attendue ;
- la liste **exhaustive** des anomalies A, B et BND (code, gravité, objet), et les informations ;
- les variations de soldes, sous les hypothèses « ABSENTES maintenues » et « ABSENTES acceptées » ;
- les lignes canoniques champ par champ (S01, S07a, S07b, S07d, S10a, S10b), et l'égalité du fond comptable entre le grand livre et le FEC (S11a, S11e).

Tableau produit par `node scripts/rapport-scenarios.js` :

| Scénario | Résultat | Statut import | Lignes lues / importées / rejetées / doublons | Statuts obtenus | Anomalies A/B/BND obtenues | Écarts |
|---|---|---|---|---|---|---|
| S01 | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S02a | conforme | REIMPORT_FICHIER | non lu | — | — | 0 |
| S02b | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S03 | conforme | ANALYSE | 53 / 50 / 0 / 3 | NOUVELLE 7, INCHANGEE 4, MODIFIEE 8, ABSENTE 2, DOUBLON_INTRA 1 | IDN_MOD_FOND (A), IDN_ABSENTE (A), IDN_MOD_FOND (A), IDN_ABSENTE (A), IDN_DOUBLON_INTRA (A), VOL_SUPPR_MASSE (B) | 0 |
| S04 | conforme | ANALYSE | 18 / 17 / 0 / 0 | NOUVELLE 2, INCHANGEE 4 | — | 0 |
| S05 | conforme | REJETE (bloqué) | 11 / 11 / 0 / 0 | NOUVELLE 1, COLLISION 2 | IDN_COLLISION (BND), IDN_COLLISION (BND) | 0 |
| S06 | conforme | REJETE (bloqué) | 8 / 8 / 0 / 0 | NOUVELLE 3 | EQU_GLOBAL (BND), EQU_ECRITURE (B) | 0 |
| S07a | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S07b | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S07c | conforme | REJETE (bloqué) | 36 / 0 / 36 / 0 | — | STR_ENCODAGE (BND) | 0 |
| S07d | conforme | ANALYSE | 36 / 36 / 0 / 0 | INCHANGEE 14 | — | 0 |
| S08 | conforme | ANALYSE | 10 / 10 / 0 / 0 | INCHANGEE 1, MODIFIEE 3 | IDN_MOD_FOND (A), PER_CLOTURE (B) | 0 |
| S09 | conforme | REJETE (bloqué) | 10 / 8 / 2 / 0 | NOUVELLE 3 | REJ_LIGNES (BND), CPT_COLLISION_PADDING (BND), CPT_CLASSE (B) | 0 |
| S10a | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S10b | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S10c | conforme | REJETE (bloqué) | non lu | — | CLI_MISMATCH (BND) | 0 |
| S11a | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | — | 0 |
| S11b1 | conforme | REJETE (bloqué) | 36 / 0 / 36 / 0 | — | STR_ENTETE (BND) | 0 |
| S11b2 | conforme | REJETE (bloqué) | 36 / 0 / 36 / 0 |  | REJ_LIGNES (BND) | 0 |
| S11c | conforme | REJETE (bloqué) | 37 / 36 / 1 / 0 | NOUVELLE 14 | REJ_LIGNES (BND) | 0 |
| S11d | conforme | REJETE (bloqué) | non lu | — | PRF_CHANGEMENT (BND) | 0 |
| S11e | conforme | ANALYSE | 36 / 36 / 0 / 0 | NOUVELLE 14 | REC_TOTAL_SAISI (B) | 0 |

Correspondance avec les tests T01 à T15 du cahier des charges (§21.1) :

| Test | Couverture |
|---|---|
| T01 | S01, S07a, S07b, S07d (zéros de tête, libellés `=`, `+`, `@`, `=IMPORTRANGE`) |
| T02 | S02a, S02b |
| T03 | S03 |
| T04 | S04 |
| T05 | S03 (doublon), S05 (collisions) |
| T06 | S06 |
| T07 | S07a à S07d |
| T08 | S08 |
| T09 | S09 |
| T10 | S10a à S10c |
| T11 | S11a à S11e |
| T14 | `comparaison-publication.test.js` et propriétés « Retour arrière », **en mémoire** |
| T15 | Test « Publication (T15) » |
| T12, T13 | Non couverts : voir §6 |

## 3. Tests de propriétés (idempotence, intégrité, comparaison)

Le générateur de nombres pseudo-aléatoires (mulberry32) utilise des graines fixes : 1000–1059, 2000–2059, etc. Un échec est donc rejouable à l'identique. L'oracle est la construction même du jeu : chaque mutation appliquée a un statut attendu connu à l'avance.

| Propriété | Énoncé vérifié | Jeux | Résultat |
|---|---|---|---|
| Comparaison | Statuts obtenus = statuts construits, pour 6 types de mutation : montant (M_FOND), compte (M_FOND), lettrage (M_LET), libellé (M_DESC), date (M_DATE), suppression (ABSENTE), plus des ajouts (NOUVELLE) et des écritures inchangées | 60 | 60/60 |
| Idempotence 1 | Réimport du même contenu, écritures réordonnées et fins de ligne CRLF : 100 % INCHANGEE, 0 anomalie, 0 variation ; la publication ne crée aucun mouvement et laisse le checksum inchangé | 60 | 60/60 |
| Idempotence 2 | `classer(publier(B, F), F)` = 100 % INCHANGEE | 60 | 60/60 |
| Intégrité | Σ des variations de soldes = 0 ; aucun REC_MIROIR, REC_LIGNES, REC_TOTAUX ni déséquilibre parasite ; actif publié équilibré ; chaque ligne active rattachée à un import, une publication et une clé | 60 | 60/60 |
| Retour arrière | `annuler(publier(B, Δ))` = B : checksum identique **et** actif identique champ par champ | 60 | 60/60 |
| Retour arrière, premier import | L'annulation du premier import rend un actif vide | 1 | 1/1 |
| Déterminisme | Mêmes entrées, mêmes sorties en profondeur ; l'ordre des écritures du fichier ne change ni la classification, ni les variations, ni le checksum publié (hors rang source) | 60 | 60/60 |
| Isolation | Le même fichier chez deux clients produit des clés disjointes | 1 | 1/1 |

## 4. Défauts trouvés et corrigés pendant les tests

Les jeux de l'ingénieur ont été confrontés au moteur après leur production. Au premier passage, **14 cas sur 22** étaient conformes. Chaque écart a été analysé avant toute correction.

| # | Constat | Cause | Correction |
|---|---|---|---|
| D1 | S07b : « — » lu « \x97 » ; une écriture classée MODIFIEE au lieu d'INCHANGEE | **Défaut de la plateforme** : sous Node 22, `TextDecoder('windows-1252')` décode les octets 0x80 à 0x9F comme de l'ISO-8859-1 (€, —, ’… perdus). L'architecte avait signalé ce point comme à vérifier | Décodeur windows-1252 explicite dans l'adaptateur Node, avec une table WHATWG et U+FFFD pour les positions non définies. Test dédié ajouté. `normTexte` neutralise en outre les caractères de contrôle C1. À reproduire côté Apps Script (`getDataAsString('windows-1252')`, spike SP5) |
| D2 | S05 : lignes en collision non comptées comme importées, d'où un REC_LIGNES (BND) parasite | Défaut du moteur | Les lignes en collision restent en staging et sont comptées (l'import reste bloqué par IDN_COLLISION) |
| D3 | S07c, S11b1 : lignes interprétées malgré un encodage ou un en-tête invalide | Défaut du moteur | Si la structure est invalide, aucune ligne n'est interprétée |
| D4 | S09, S11c : plusieurs REJ_LIGNES (un par motif) au lieu d'un seul | Divergence de convention entre le contrat (une anomalie par motif) et l'ingénieur (une seule) | Une seule anomalie par import, détaillée par motif et par rang (écart E8 du contrat) |
| D5 | S11b2 : REC_TOTAL_SAISI « total absent » levé alors que toutes les lignes sont rejetées | Contrôle mal placé | Le total logiciel n'est rapproché que si aucune ligne n'est rejetée (REJ_LIGNES bloque déjà) |
| D6 | S03 : écart apparent sur les variations de soldes | **Erreur de l'outil de comparaison**, pas du moteur ni de l'attendu : `variations_soldes` (ABSENTES maintenues) était comparé à la restitution « ABSENTES acceptées ». Une première interprétation, qui attribuait l'erreur au fichier d'attendus, était **fausse** ; elle a été annulée et le fichier rétabli à l'identique | L'outil teste désormais les trois hypothèses définies dans l'attendu ; toutes concordent |
| D7 | S09 : écriture OD 000090, entièrement rejetée, signalée comme absente du résultat | Outil de comparaison : `statut: null` dans l'attendu signifie « absente du résultat » | Convention prise en compte |

**Pendant le développement, avant les jeux de l'ingénieur** : un test unitaire initial attendait un M_DATE pur alors que le générateur de test changeait aussi la date de pièce. Le moteur détectait à juste titre M_DATE + M_DESC ; c'est le test qui a été corrigé. Par ailleurs, des espaces insécables littéraux, invisibles, avaient été introduits dans des expressions régulières du code : ils ont été remplacés par des séquences `\uXXXX`.

**Aucun résultat attendu de l'ingénieur n'a été modifié** pour obtenir la conformité.

## 5. Mesure de volume (indicative, Node local)

`node scripts/mesure-volume.js` : FEC fictif, puis réimport cumulatif avec 2 % d'écritures modifiées et 10 supprimées.

```
FEC fictif : 5000 écritures, 15133 lignes
Analyse import 1 (base vide)              1212 ms
Validation + publication 1                1314 ms
Analyse import 2 (cumulatif modifié)      1548 ms
  statuts : {"NOUVELLE":0,"INCHANGEE":4891,"MODIFIEE":99,"ABSENTE":10,"COLLISION":0,"DOUBLON_INTRA":0,"REIMPORT_FICHIER":0}
Validation + publication 2                1151 ms
Annulation publication 2                   317 ms

FEC fictif : 20000 écritures, 60123 lignes
Analyse import 1 (base vide)              7480 ms
Validation + publication 1                5943 ms
Analyse import 2 (cumulatif modifié)     11531 ms
  statuts : {"NOUVELLE":0,"INCHANGEE":19591,"MODIFIEE":399,"ABSENTE":10,"COLLISION":0,"DOUBLON_INTRA":0,"REIMPORT_FICHIER":0}
Validation + publication 2                5275 ms
Annulation publication 2                  1379 ms
```

Lecture :
- Le cœur est **linéaire** dans l'ordre de grandeur mesuré : environ 0,1 à 0,2 ms par ligne et par étape.
- Les empreintes et checksums sont recalculés plusieurs fois par cycle : intégrité, validation, publication et preuve de réversibilité. C'est le premier levier d'optimisation.
- **Ces temps ne se transposent pas à Apps Script.** Le V8 d'Apps Script, `Utilities.computeDigest` et les lectures et écritures Sheets sont plus lents. Il faut les mesurer (spikes SP2, SP3, SP4) avant de fixer le plafond de volume (50 000 lignes proposées) et la taille des lots.

## 6. Limitations connues

| # | Limitation | Conséquence | Suite prévue |
|---|---|---|---|
| L1 | Aucun test dans Google Sheets ni dans Apps Script | Conversions de cellules, neutralisation `setValues` (SP1), quotas, 6 min, déclencheurs : non vérifiés | Spikes SP1 à SP12, puis adaptateurs `gas/` |
| L2 | **T13, reprise après échec en cours d'exécution, non couvert** : pas encore de machine à états ni de traitement par lots | Seule la reprise « logique » est garantie : une publication non aboutie ne modifie rien, et la rejouer depuis le même état donne le même résultat (fonctions pures). La reprise depuis un curseur n'existe pas encore | Étape suivante : états `IMPORTS`, lots, ports en mémoire avec injection de pannes, puis Apps Script |
| L3 | T12 (volume) mesuré sous Node seulement | Aucun plafond validé | SP2 à SP4, SP7 |
| L4 | Retour arrière testé **en mémoire** ; pas de double tampon ACTIF_A/B | La bascule atomique par cellule pointeur n'est pas prouvée | SP6 |
| L5 | 18 écarts de forme avec le contrat (format des empreintes, codes de refus, décisions typées…) | Format des empreintes **non figé** : rien ne doit être persisté avant l'alignement | Contrat §11.2 |
| L6 | Les statuts d'anomalie entre imports (OUVERTE → RÉSOLUE) ne sont pas gérés | La reconduction A5 est calculée, mais le cycle de vie complet ne l'est pas | Étape suivante |
| L7 | Règles [V-EC] non validées : montants négatifs reclassés, classe 9, écriture validée modifiée, une seule date par écriture | Une règle pourrait changer | Expert-comptable |
| L8 | Profil grand livre fictif (`GL_TEST`) ; aucun export réel | Aucun format réel de logiciel n'est validé | Exports pilotes anonymisés (M0) |
| L9 | Migration contrôlée GL ↔ FEC (A4) spécifiée, **non implémentée** ; renumérotation, jumelles, doublons inter-imports reportés | Repli sûr : blocage, ou ABSENTE + NOUVELLE visibles | V1.1 |
| L10 | Jeux de taille réduite (S01 : 14 écritures au lieu de 40) | VOL_SUPPR_MASSE se déclenche mécaniquement en S03 (2/14) | Normal à cette taille ; calibrage D7 sur les cycles rejoués |
| L11 | Pas de vérification automatique d'immutabilité des entrées (I10), ni de vecteur de test du Hasher | Aucune mutation observée, mais rien ne la prouve | Ajouter les tests (contrat E17) |
