# Jeux de test de l'import comptable — premier lot (données 100 % FICTIVES)

Version 0.1 — rédigé par `ingenieur-outils-financiers` sur la branche
`claude/import-comptable-prototype`. Fichiers : `import-comptable/test/fixtures/`.
Référence : cahier des charges, partie B, §16 (règles), §17 (contrôles), §21 (tests).

## 1. Statut

| Élément | Statut |
|---|---|
| Fichiers sources des 11 scénarios (23 cas) | **Existant vérifié** : générés, reproductibles (empreintes identiques sur deux générations) |
| Résultats attendus `attendus/*.json` | **Écrits à la main** à partir de la conception, avant confrontation au code |
| Cohérence structurelle attendus ↔ fichiers | **Vérifiée** par `generateur/verifier_fixtures.py` : 0 échec (lignes lues, vides, ΣD/ΣC, lignes à neutraliser, Σ Δ soldes = 0, octets identiques, lignes canoniques S01) |
| Exécution contre le moteur `src/` | **Faite le 2026-10-09** : 22/22 cas conformes après corrections du moteur et de l'outil de comparaison, **sans modification des attendus** — voir `resultats-tests.md` §2 et §4 |
| Règles marquées [V-EC] (montants négatifs, classe 9) | **À valider** par un professionnel habilité ; agent `expert-comptable-fiscal` : **à créer** (absent de `.claude/agents/`) |

## 2. Comment les attendus ont été établis

1. **Conception d'un jeu de référence S01** (14 écritures, 36 lignes) dans une
   table écrite à la main (`generateur/generer.py`, fonction `s01`) : chaque
   écriture, chaque compte, chaque montant en centimes.
2. **Chaque scénario dérive de S01 (ou d'un petit jeu dédié) par des
   modifications volontaires et nommées** (ex. S03 : AC 000045 passe à
   550/110/660). Le statut attendu de chaque écriture découle directement de
   la modification introduite et des règles §16.5 / §17, sans exécuter de
   moteur de classification.
3. **Les grandeurs chiffrées** (lignes, totaux, variations de soldes) ont été
   calculées à la main, puis contrôlées mécaniquement par
   `verifier_fixtures.py`, qui ne classe rien.
4. Le générateur se contente de **sérialiser** la conception (encodage, BOM,
   CRLF, guillemets RFC 4180, tri par compte du grand livre, formats de
   montants). La seule sortie dérivée, `attendus/S01_lignes_canoniques.json`,
   est la transcription de la table de conception sous forme canonique.

## 3. Scénarios et correspondance T01–T15

| Scénario | Vérifie | Tcdc | Attendu clé |
|---|---|---|---|
| S01 | premier import, zéros de tête (numéros, auxiliaires), padding, brouillard, libellés `= + @` et `=IMPORTRANGE`, accents | T01 | 14 NOUVELLE ; ΣD = ΣC = 1 622 500 ; 0 A/B/BND ; SEC_NEUTRALISE 13 lignes |
| S02a | réimport octet pour octet | T02 | REIMPORT_FICHIER, arrêt, 0 changement |
| S02b | idempotence : ordre et CRLF indifférents | T02 | 14 INCHANGEE |
| S03 | cumulatif M+1 : M_FOND, M_LET ×5, M_DESC, M_DATE, ABSENTE ×2 dont PROV-17 (renumérotation non détectée), loyers identiques, DOUBLON_INTRA, nouvelles | T03, T05 (doublon) | 7 NOUVELLE / 4 INCHANGEE / 8 MODIFIEE / 2 ABSENTE / 1 bloc doublon ; Δ 60700000 = +5 000 ; Σ Δ = 0 |
| S04 | chevauchement de périodes ; ligne vide | T04 | 0 ABSENTE en janvier–février ; 4 INCHANGEE, 2 NOUVELLE ; vides = 1 |
| S05 | collisions (2 contenus ; 2 dates) | T05 (collision) | IDN_COLLISION ×2 (BND) |
| S06 | déséquilibre de 1 centime | T06 | EQU_ECRITURE (B) + EQU_GLOBAL (BND) |
| S07a–d | BOM, windows-1252, double encodage, Montant + Sens | T07 | a, b, d : 14 INCHANGEE sur base S01 ; c : STR_ENCODAGE (BND) |
| S08 | exercice clôturé : fond vs lettrage | T08 | PER_CLOTURE (B) + IDN_MOD_FOND (A) sur AC 000301 ; M_LET ×2 accepté |
| S09 | comptes : collision de padding, trop long, non numérique, classe 9 | T09 | REJ_LIGNES (2 lignes), CPT_COLLISION_PADDING (BND), CPT_CLASSE (B) |
| S10a–c | isolation des clients | T10 | clés préfixées par client ; CLI_MISMATCH (BND), 0 ligne écrite |
| S11a–e | grand livre : avec numéro, sans colonne, numéro vide, ligne « Total », FEC après GL, total saisi faux ; formats `1 234,56` (U+00A0, U+202F), `25,00-`, `(25,00)` | T11, T07 (formats) | 14 NOUVELLE / STR_ENTETE / REJ_LIGNES / REJ_LIGNES / PRF_CHANGEMENT / REC_TOTAL_SAISI |

**Non couverts par ce lot** (à produire ensuite) :

| Tcdc | Raison | Proposition |
|---|---|---|
| T12 Volume | demande un générateur à graine fixe au plafond §13.2 | étendre `generer.py` (graine, N lignes) après fixation du plafond (SP3/SP4) |
| T13 Reprise | porte sur l'adaptateur Sheets et la machine à états, pas sur les données | réutiliser S01 → S03 avec pannes injectées ; attendu = état de l'exécution sans panne |
| T14 Retour arrière | idem | après S01 puis S03 publiés : annulation → actif = actif après S01 (36 lignes, ΣD = ΣC = 1 622 500, AC 000045 à 500,00) |
| T15 Validation | règles de go §18 | S03 fournit déjà B (VOL_SUPPR_MASSE), A et ABSENTES ; S05/S06 fournissent des BND |
| T01 volume nominal | le cahier prévoit 40 écritures / 120 lignes | volontairement réduit à 14 / 36 pour la vérification à la main |

## 4. Détail S03 (écart à l'exemple §6.8)

| Écriture | Base (S01) | Fichier S03 | Attendu |
|---|---|---|---|
| AC 000045 | 607 D 500 / 44566 D 100 / 401 C 600 | 550 / 110 / 660 | MODIFIEE `M_FOND`, IDN_MOD_FOND (A, validée) |
| BQ 000211 | 05/03 | 04/03 (pièce et validation au 05/03) | MODIFIEE `M_DATE`, IDN_MOD_FOND (A) |
| VT 000121 | « … — été » | « … — été 2026 » | MODIFIEE `M_DESC` (I) |
| VT 000122, VT 000123, AC 000044, BQ 000209, BQ 000210 | non lettrées | 1 ligne lettrée chacune (AE, AB, AC) | MODIFIEE `M_LET` ×5 (I, auto) |
| OD 000012 | présente | absente | ABSENTE, IDN_ABSENTE (A) |
| AC PROV-17 | brouillard | absente ; AC 000051 identique, validée | ABSENTE + NOUVELLE (repli MVP) |
| BQ 000301, BQ 000302 | — | 613200 D 1 500 / 512 C 1 500, même pièce | 2 NOUVELLE, aucune anomalie |
| VT 000124 | — | 2 blocs identiques (rangs 39-41 et 44-46) | NOUVELLE + IDN_DOUBLON_INTRA (A) ; 3 lignes ignorées |
| VT 000120, BQ 000208, BQ 000212, OD 000013 | — | identiques | INCHANGEE |
| BQ 000215, AC 000052, OD 000014 | — | avril | NOUVELLE |
| Volume | — | 2 ABSENTES / 14 = 14,3 % | VOL_SUPPR_MASSE (B) |

Lignes : 53 lues = 50 importées + 3 doublons ignorés. ΣD = ΣC importés =
2 612 500 (fichier : 2 708 500).

## 5. Arbitrages pris pour écrire les attendus (à confirmer par le dirigeant)

Chaque point est une interprétation du cahier des charges ; le code doit s'y
aligner ou l'attendu doit être corrigé (décision tracée).

| # | Point | Choix retenu dans les attendus |
|---|---|---|
| A1 | `lues` et lignes vides | `lues` inclut les lignes vides (formule REC_LIGNES §17) |
| A2 | `totaux` avec doublons ou rejets | ΣD/ΣC des lignes **importées** ; `totaux_fichier` donné en plus pour S03 |
| A3 | Comptage DOUBLON_INTRA | `statuts.DOUBLON_INTRA` = blocs ignorés ; l'écriture reste NOUVELLE |
| A4 | Rang | 1 = première ligne de données ; les lignes vides comptent |
| A5 | Montant négatif dans une colonne D/C (GL) | montant signé = D − C conservé, puis D/C recalculés (`(25,00)` en crédit = débit 25,00) + MNT_NEG (I) [V-EC] |
| A6 | Grand livre sans auxiliaire | GL_TEST respecte les 10 colonnes imposées : `comp_aux_num` vide ; « même fond que S01 » s'entend hors auxiliaire. **Alternative** : ajouter une colonne auxiliaire au profil GL |
| A7 | Exercice clôturé + M_FOND | PER_CLOTURE (B) **et** IDN_MOD_FOND (A) (contrôles indépendants) |
| A8 | Base S08 | publiée avec 2025 OUVERT (`client-CLI-TEST-2025-OUVERT.json`), puis exercice clôturé |
| A9 | VOL_SUPPR_MASSE | dénominateur = écritures de la base dans le périmètre ; déclenché en S03 (2/14) |
| A10 | Ordre des contrôles à la réception | CLI_MISMATCH avant file_sha256 (S10c a les mêmes octets qu'un fichier déjà publié chez B) |
| A11 | Neutralisation | valeur canonique = valeur d'origine ; neutralisation à l'écriture Sheets ; SEC_NEUTRALISE compte les lignes (au moins une valeur texte commençant par `= + - @`) |
| A12 | Guillemets | RFC 4180 appliqué aussi au FEC TAB : `"=IMPORTRANGE(""x"",""y"")"` |
| A13 | GL sans numéro | colonne absente → STR_ENTETE (S11b1) ; valeurs vides → REJ_LIGNES (S11b2) |
| A14 | Profil windows-1252 | profil séparé `FEC_GENERIQUE_CP1252` |
| A15 | Compteurs d'un import arrêté avant lecture | `null` (S02a, S07c, S10c, S11b1, S11d) |
| A16 | S09 | OD 000090 a ses deux lignes invalides pour éviter un déséquilibre en cascade |

## 6. Mise en service des jeux

1. Régénérer : `python3 -I import-comptable/test/fixtures/generateur/generer.py`.
2. Vérifier : `python3 -I import-comptable/test/fixtures/generateur/verifier_fixtures.py` (doit afficher `TOUT CONFORME`).
3. Le harnais de test du moteur charge `attendus/<ID>.json`, publie la `base`
   dans l'ordre, importe `fichier` avec `profil` et `perimetre`, puis compare
   `rejete`, `compteurs_lignes`, `totaux`, `statuts`, `ecritures`, `anomalies`
   (exhaustif), `infos`, `variations_soldes`.
4. Tout écart est soit un défaut du code, soit un arbitrage §5 à trancher par
   le dirigeant ; un attendu n'est jamais modifié pour faire passer un test
   sans décision tracée.
