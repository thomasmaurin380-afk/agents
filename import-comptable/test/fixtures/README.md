# Jeux de données de test — import comptable (100 % FICTIFS)

Toutes les données de ce dossier sont **fictives** : client `CLI-TEST`
(SIREN fictif `123456789`), clients d'isolation `CLI-TEST-A` (`111111111`)
et `CLI-TEST-B` (`222222222`), sociétés inventées (« Dupont Fictif SARL »,
« Élan Conseil Fictif », « Bureau Fictif SAS », « Grossiste Fictif »).
Aucun export réel, aucun identifiant de classeur, aucun secret.

Les **résultats attendus** (`attendus/*.json`) ont été écrits **à la main**
à partir de la conception de chaque scénario (modifications introduites
volontairement), indépendamment du code de `src/`. Voir
`docs/import-comptable/jeux-de-test.md` pour la méthode et la correspondance
avec les jeux T01–T15 du cahier des charges.

## Arborescence

```
client-CLI-TEST.json              client de référence (2025 CLOTURE, 2026 OUVERT, L = 8)
client-CLI-TEST-2025-OUVERT.json  même client avant clôture 2025 (base de S08 uniquement)
client-CLI-TEST-A.json / -B.json  clients d'isolation (S10)
profils/FEC_GENERIQUE.json        FEC 18 colonnes, TAB, UTF-8, AAAAMMJJ, débit/crédit
profils/FEC_GENERIQUE_CP1252.json idem en windows-1252 (S07b)
profils/FEC_MONTANT_SENS.json     FEC avec colonnes Montant + Sens (S07d)
profils/GL_TEST.json              grand livre fictif « logiciel TEST » (';', JJ/MM/AAAA, trié par compte)
scenarios/<ID>/...                fichiers sources (noms FEC : <SIREN>FEC<AAAAMMJJ>.txt)
attendus/<ID>.json                résultats attendus
attendus/S01_lignes_canoniques.json  36 lignes canoniques de référence (S01)
generateur/generer.py             régénère scenarios/ et S01_lignes_canoniques.json (déterministe)
generateur/verifier_fixtures.py   vérifie la cohérence structurelle attendus ↔ fichiers
```

Régénérer puis vérifier :

```
python3 -I import-comptable/test/fixtures/generateur/generer.py
python3 -I import-comptable/test/fixtures/generateur/verifier_fixtures.py
```

`verifier_fixtures.py` ne classe rien : il contrôle seulement les
grandeurs mécaniques (lignes lues, lignes vides, ΣD/ΣC du fichier, lignes à
neutraliser, Σ variations = 0, octets identiques, lignes canoniques S01).

## Conventions des attendus

| Élément | Convention |
|---|---|
| Clé | forme courte `JOURNAL\|NUMERO` (ex. `AC\|000045`) ; clé complète = `client_id\|exercice_id\|JOURNAL\|NUMERO` |
| Comptes | normalisés, paddés à droite à 8 (`401` → `40100000`) |
| Montants | centimes entiers |
| Rang | numéro d'enregistrement de données, 1 = première ligne après l'en-tête (les lignes vides comptent) |
| `lues` | enregistrements après l'en-tête, **lignes vides comprises** ; `lues = importees + rejetees + vides + doublons_ignores` |
| `totaux` | ΣD / ΣC des lignes **importées** (hors rejetées, hors blocs doublons) ; `totaux_fichier` (S03) = toutes les lignes lues |
| `statuts.DOUBLON_INTRA` | nombre de **blocs ignorés** ; l'écriture conservée est comptée dans `NOUVELLE` (ou son statut propre) |
| `anomalies` | liste **exhaustive** des codes A / B / BND attendus |
| `infos` | codes I attendus (`M_DESC`, `M_LET`, `MNT_NEG`, `SEC_NEUTRALISE`, `REIMPORT_FICHIER`) ; non vérifiés sur un import rejeté |
| `variations_soldes` | solde = débit − crédit ; Δ = après simulé − avant ; comptes à Δ nul omis ; Σ = 0 |
| `compteurs_lignes: null` | import arrêté avant lecture des lignes (réimport, CLI_MISMATCH, STR_ENCODAGE, STR_ENTETE, PRF_CHANGEMENT) |
| `base` | imports à publier **dans l'ordre** avant le scénario (anomalies B/A éventuelles de la base dérogées/acquittées) |
| Textes absents | `""` ; montant devise absent : `null` |
| Libellés `= + @` | valeur canonique = valeur d'origine ; neutralisée à l'écriture dans Sheets, relue identique ; `SEC_NEUTRALISE` (I) compte les lignes |

## Données de référence S01 (janvier–mars 2026, 14 écritures / 36 lignes)

| Clé | Date | Lignes (D / C, euros) | Particularité |
|---|---|---|---|
| VT\|000120 | 08/01 | 411/0012 D 600 ; 706000 C 500 ; 44571 C 100 | libellé `=1+1 Facture…` ; 411 lettrée AA |
| VT\|000121 | 12/01 | 411/0045 D 2 400 ; 706000 C 2 000 ; 44571 C 400 | libellé accentué « — été » |
| VT\|000122 | 14/01 | 411/0045 D 1 800 ; 706000 C 1 500 ; 44571 C 300 | libellé `+Facture…` |
| VT\|000123 | 15/01 | 411/0012 D 1 200 ; 706000 C 1 000 ; 44571 C 200 | |
| AC\|000044 | 20/01 | 606100 D 250 ; 44566 D 50 ; 401/0078 C 300 | libellé `@Achat…` |
| BQ\|000208 | 31/01 | 512 D 600 ; 411/0012 C 600 | 411 lettrée AA |
| AC\|000045 | 10/02 | 607 D 500 ; 44566 D 100 ; 401/0091 C 600 | |
| BQ\|000209 | 15/02 | 401/0078 D 300 ; 512 C 300 | |
| BQ\|000210 | 20/02 | 512 D 1 200 ; 411/0012 C 1 200 | non lettrée |
| OD\|000012 | 28/02 | 6226 D 300 ; 4081 C 300 | |
| AC\|PROV-17 | 05/03 | 606100 D 300 ; 401/0078 C 300 | brouillard (ValidDate vide) |
| BQ\|000211 | 05/03 | 627800 D 25 ; 512 C 25 | |
| BQ\|000212 | 10/03 | 512 D 2 400 ; 411/0045 C 2 400 | |
| OD\|000013 | 31/03 | 641000 D 3 000 ; 645000 D 1 200 ; 421 C 3 000 ; 431 C 1 200 | libellé `=IMPORTRANGE("x","y")` (champ entre guillemets RFC 4180) |

ΣD = ΣC = 16 225,00 € (1 622 500 cts). ValidDate = EcritureDate sauf PROV-17 ;
PieceDate = EcritureDate ; Montantdevise / Idevise vides ; montants FEC
« 1200,00 » (côté nul écrit « 0,00 »).

## Scénarios

| ID | Fichier(s) | Base | Ce qui est introduit volontairement | Attendu principal |
|---|---|---|---|---|
| S01 | `S01/` | vide | référence ci-dessus | 14 NOUVELLE, 0 A/B/BND, SEC_NEUTRALISE 13 |
| S02a | `S02/a_memes_octets/` | S01 | copie octet pour octet | REIMPORT_FICHIER, arrêt, 0 changement |
| S02b | `S02/b_reordonne_crlf/` | S01 | écritures en ordre inverse, lignes inversées dans VT 000120 et OD 000013, CRLF | 14 INCHANGEE |
| S03 | `S03/` (jan–avr) | S01 | AC 000045 → 550/110/660 ; lettrages AE, AB, AC sur 5 lignes de 5 écritures ; OD 000012 et PROV-17 retirées ; AC 000051 (= PROV-17 validée) ; libellé VT 000121 ; date BQ 000211 05/03 → 04/03 ; loyers BQ 000301 / 000302 ; VT 000124 en 2 blocs ; BQ 000215, AC 000052, OD 000014 | 7 NOUVELLE, 4 INCHANGEE, 8 MODIFIEE (1 M_FOND, 1 M_DATE, 1 M_DESC, 5 M_LET), 2 ABSENTE, 1 DOUBLON_INTRA ; VOL_SUPPR_MASSE (B) |
| S04 | `S04/` (mar–avr) | S01 | 4 écritures de mars inchangées + AC 000052, OD 000014 ; une ligne vide | 4 INCHANGEE, 2 NOUVELLE, 0 ABSENTE |
| S05 | `S05/` | vide | VT 000130 en 2 blocs de contenus différents ; BQ 000220 à 2 dates | IDN_COLLISION ×2 (BND) |
| S06 | `S06/` | vide | VT 000140 débit 1 200,01 | EQU_ECRITURE (B) + EQU_GLOBAL (BND) |
| S07a | `S07/a_utf8_bom/` | S01 | BOM UTF-8 | 14 INCHANGEE |
| S07b | `S07/b_cp1252/` | S01 | windows-1252, profil CP1252 | 14 INCHANGEE |
| S07c | `S07/c_double_encodage/` | S01 | UTF-8 relu en 1252 puis réencodé | STR_ENCODAGE (BND) |
| S07d | `S07/d_montant_sens/` | S01 | colonnes Montant + Sens | 14 INCHANGEE |
| S08 | `S08/base/`, `S08/import/` | FEC 2025 (4 écritures) | AC 000301 400/80/480 → 450/90/540 ; lettrage AA de VT 000501 et BQ 000601 | PER_CLOTURE (B) + IDN_MOD_FOND (A) ; 2 M_LET (I) |
| S09 | `S09/` | vide | `4011` et `40110` ; OD 000090 sur `401234567890` et `401DUPONT` ; `901` | REJ_LIGNES (2 lignes), CPT_COLLISION_PADDING (BND), CPT_CLASSE (B) |
| S10a / S10b | `S10/A/`, `S10/B/` | vide | mêmes octets que S01, noms aux SIREN de A / B | 14 NOUVELLE chacun, clés préfixées par le client |
| S10c | `S10/A/` chez B | S10b | fichier de A déposé chez B | CLI_MISMATCH (BND), 0 ligne écrite |
| S11a | `S11/a_gl_avec_numero/` | vide | S01 en GL trié par compte ; milliers U+00A0 / U+202F ; `25,00-` et `(25,00)` ; lettrage `0` | 14 NOUVELLE, fond identique à S01 (hors auxiliaire), MNT_NEG ×2 (I) |
| S11b1 | `S11/b1_gl_sans_colonne_numero/` | vide | colonne « N° écriture » absente | STR_ENTETE (BND), « exporter le FEC » |
| S11b2 | `S11/b2_gl_numero_vide/` | vide | colonne présente, valeurs vides | REJ_LIGNES 36 lignes (BND) |
| S11c | `S11/c_gl_ligne_total/` | vide | ligne « Total compte 401 » au rang 5 | REJ_LIGNES 1 ligne (BND) |
| S11d | `S11/d_fec_apres_gl/` | S11a (GL) | FEC S01 sur l'exercice 2026 typé GL | PRF_CHANGEMENT (BND) |
| S11e | `S11/a_gl_avec_numero/` | vide | total saisi par l'opérateur faux de 1,00 € en débit | REC_TOTAL_SAISI (B) |

Les GL portent un `total_saisi` (dans `attendu`, et dans `base` pour S11d)
car `REC_TOTAL_SAISI` est obligatoire pour un grand livre.
