# import-comptable — prototype local du cœur (étape 1)

Moteur d'import comptable incrémental : lecture et normalisation CSV (FEC, grand livre),
identification des écritures (clé K2), doublons, modifications, contrôles, validation,
publication et retour arrière **en mémoire**. JavaScript pur, sans dépendance, compatible
Apps Script V8 (vérifié par simulation) ; **aucune intégration Google à ce stade**.

> Données **fictives uniquement**. Ne jamais placer de données client réelles dans ce dépôt.

```
npm test                               # 61 tests (Node ≥ 20 ; validé sous Node 22.22)
node scripts/rapport-scenarios.js      # tableau attendu / obtenu des scénarios fictifs
node scripts/mesure-volume.js 20000    # mesure indicative de volume (Node)
python3 -I test/fixtures/generateur/generer.py   # régénère les jeux fictifs (reproductible)
```

| Dossier | Contenu |
|---|---|
| `src/core/` | Règles métier pures : `modele`, `normalisation`, `csv`, `anomalies`, `identite`, `profil`, `lecture`, `comparaison`, `controles`, `publication` |
| `src/app/pipeline.js` | Cas d'usage en mémoire : `analyserImport`, `valider`, `publier`, `annulerDernierePublication` |
| `src/adapters/node/` | Hachage SHA-256 et lecture de fichiers (dont décodage windows-1252) pour Node |
| `test/` | Tests unitaires, de propriétés, d'architecture et de scénarios ; `fixtures/` = jeux fictifs et attendus |

Documentation : `../docs/import-comptable/` — cahier des charges (§26–§28), contrat d'interface,
jeux de test, résultats des tests.
