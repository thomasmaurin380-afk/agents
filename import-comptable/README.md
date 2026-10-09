# import-comptable — prototype local du cœur

Moteur d'import comptable incrémental : lecture et normalisation CSV (FEC, grand livre), identification des
écritures (clé K2), doublons, modifications, contrôles, validation, publication et retour arrière **en mémoire**.
JavaScript pur, sans dépendance, compatible Apps Script V8 (vérifié par simulation) ; **rien n'est déployé**.

> Données **fictives uniquement**. Ne jamais placer de données client réelles dans ce dépôt.

```
npm test                                         # 79 tests (Node ≥ 20 ; validé sous Node 22.22)
node scripts/rapport-scenarios.js                # tableau attendu / obtenu des scénarios fictifs
node scripts/mesure-volume.js 20000              # mesure indicative de volume (Node)
python3 -I scripts/empreintes_reference.py       # empreintes de référence indépendantes (contrat §5)
python3 -I test/fixtures/generateur/generer.py   # régénère les jeux fictifs (reproductible)
node scripts/construire-gas.js                   # assemble dist/gas/ pour le palier G0 (aucun déploiement)
```

| Dossier | Contenu |
|---|---|
| `src/core/` | Règles métier pures, chargées dans l'ordre de `ordre.json` : `constantes`, `empreinte`, `normalisation`, `csv`, `profil`, `anomalies`, `identite`, `lecture`, `comparaison`, `publication`, `controles` |
| `src/app/pipeline.js` | Cas d'usage en mémoire : `analyserImport`, `valider`, `publier`, `annulerDernierePublication` |
| `src/adapters/node/` | Hachage SHA-256 et lecture de fichiers (dont décodage windows-1252) pour Node |
| `gas/` | Premier test Apps Script sur données fictives : manifeste sans autorisation, `HasherGas`, `testPrototypeFictif` |
| `test/` | Tests unitaires, de propriétés, d'architecture, de scénarios et du paquet Apps Script ; `fixtures/` = jeux fictifs et attendus |

Documentation : `../docs/import-comptable/` — cahier des charges (§26–§30), contrat d'interface (v0.2),
jeux de test, résultats des tests, plan d'intégration Apps Script.
