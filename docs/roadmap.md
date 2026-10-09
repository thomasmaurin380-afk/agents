# Roadmap

> Statut : **proposition v0.1 — en attente de validation**.
> Le MVP (`docs/mvp.md`) = phases 1 à 5, plus une tranche réduite des phases 6 et 8.

## Avancement

| Phase | Intitulé | Statut |
|---|---|---|
| 0 | Analyse d'architecture et définition du MVP | ✅ livrée (à valider) |
| 1 | Architecture et fondations | ⏳ en attente de validation des décisions D-01 à D-04 |
| 2 | Onboarding et collecte | — |
| 3 | Moteur financier et SIG | — |
| 4 | Dashboard et KPI | — |
| 5 | Rapports PDF | — |
| 5b | Tranche MVP : trésorerie simple + recommandations/actions/documents | — |
| 6 | Trésorerie et banque (complet) | — |
| 7 | Budget et contrôle de gestion | — |
| 8 | Missions et collaboration (complet) | — |
| 9 | Automatisations et alertes | — |
| 10 | Business plan et financement | — |
| 11 | Industrialisation SaaS | — |

---

## Phase 1 — Architecture et fondations

- **Objectif** : application sécurisée, deux espaces distincts, isolation multi-entreprise prouvée.
- **Fonctionnalités** : projet Next.js/TS strict, Tailwind + shadcn/ui, thème clair/sombre, layouts
  DAF et client, PostgreSQL + Drizzle + migrations, auth (connexion, invitation, 2FA DAF), cabinet,
  entreprises, membres, `TenantContext`, `authorize()`, RLS, journal d'audit, seed de démonstration
  (structure : 3 entreprises, utilisateurs DAF et clients), CI.
- **Fichiers principaux** : `app/(auth)`, `app/daf/layout.tsx`, `app/client/[companyId]/layout.tsx`,
  `lib/db.ts`, `lib/auth.ts`, `db/schema/{identity,tenancy,audit}.ts`, `db/rls/*.sql`,
  `services/tenancy/*`, `repositories/companies.ts`, `domain/money`, `tests/security/*`,
  `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`.
- **Dépendances** : décisions D-01 (hébergement), D-02 (auth), D-03 (ORM), D-05 (montants).
- **Critères d'acceptation** : un DAF voit le portefeuille ; un dirigeant ne voit que son entreprise ;
  accès direct à l'URL d'une autre entreprise ⇒ 404/403 + audit ; RLS bloque une requête SQL non
  scopée ; CI verte.
- **Tests** : unitaires `domain/money` ; intégration RLS (rôle applicatif, deux tenants) ;
  E2E Playwright connexion DAF / client / tentative d'accès croisé.
- **Risques** : RLS mal branchée avec le pool de connexions (⇒ `set_config` local à la transaction,
  testé) ; disponibilité/licence Efferd non vérifiée (⇒ composants shadcn standard en repli).
- **Livrable** : application déployable localement, deux espaces, isolation testée.

## Phase 2 — Onboarding et collecte

- **Objectif** : données financières importables, persistantes, traçables.
- **Fonctionnalités** : création de dossier entreprise (exercices, devise, plan de comptes) ;
  moteur d'import générique (téléversement → analyse → colonnes → correspondance → prévisualisation
  → contrôles → doublons → validation → enregistrement → rapport) ; parseurs CSV, XLSX, FEC ;
  balance générale ; transactions bancaires ; modèles de correspondance ; conservation du brut.
- **Fichiers** : `features/imports/*`, `domain/accounting/{fec,trial-balance}.ts`,
  `services/imports/*`, `jobs/import-commit.ts`, `db/schema/{imports,accounting,treasury}.ts`.
- **Dépendances** : Phase 1 ; stockage objet ; pg-boss.
- **Critères** : balance équilibrée (Σ D = Σ C) sinon rejet explicite ; FEC conforme aux 18 colonnes
  sinon rapport d'erreurs ligne à ligne ; réimport identique ⇒ 0 doublon ; données brutes intactes.
- **Tests** : fixtures FEC (tabulation et `|`), CSV séparateur `;` + décimales à virgule, encodages
  UTF-8/ISO-8859-1, fichiers malformés, doublons, gros fichier (100 000 lignes) en job.
- **Risques** : diversité des exports logiciels (⇒ modèles de correspondance, D-06) ; montants au
  format français mal parsés (⇒ parseur dédié testé).
- **Livrable** : import d'une vraie balance et d'un vrai relevé avec rapport d'import.

## Phase 3 — Moteur financier et SIG

- **Objectif** : SIG fiables et justifiés à partir de données de référence.
- **Fonctionnalités** : référentiels `PCG-2024` et `PCG-2025` (ANC 2022-06), mapping par préfixe le
  plus long, surcharges entreprise justifiées, calcul des 9 soldes et rubriques intermédiaires,
  mensuel / cumulé / N-N-1, détection des comptes non affectés et périodes incomplètes,
  réconciliation avec le résultat comptable, drill-down, validation et gel (`sig_snapshots`).
- **Fichiers** : `domain/sig/{rules,compute,checks}.ts`, `db/seed/sig-rule-sets/*`,
  `services/sig/*`, `features/sig/*`, `docs/sig-rules.md`, `docs/financial-rules.md`.
- **Dépendances** : Phase 2.
- **Critères** : écart 0,00 € avec le jeu de référence manuel ; tout compte de classes 6/7 non
  affecté ⇒ anomalie bloquante ; même entrée ⇒ même sortie (déterminisme).
- **Tests** : tableaux de vérité par rubrique, cas d'exercice décalé, stocks (603x/713x), comptes
  d'une seule période, comptes créditeurs en classe 6, tests de propriétés (Σ rubriques = résultat).
- **Risques** : interprétation des règles PCG ⇒ **validation du référentiel par vous** avant gel.
- **Livrable** : tableau SIG N/N-1 validable et publiable.

## Phase 4 — Dashboard et KPI

- **Objectif** : tableaux de bord réellement alimentés.
- **Fonctionnalités** : catalogue KPI versionné, calcul avec traçabilité et « Données insuffisantes »,
  objectifs, seuils, visibilité client, sélecteur de période, graphiques (CA mensuel, encaissements/
  décaissements, trésorerie, répartition des charges), portefeuille DAF enrichi, accueil client.
- **Fichiers** : `domain/kpi/*`, `services/kpi/*`, `features/{kpi,dashboard,portfolio}/*`,
  `components/{kpi-card,charts}/*`, `docs/kpi-catalog.md`.
- **Critères** : chaque KPI affiche valeur, période, comparaison, définition, formule, provenance,
  date d'actualisation ; DAF et client affichent les mêmes montants.
- **Tests** : unitaires par KPI (dont division par zéro, données manquantes) ; E2E cohérence DAF/client.
- **Risques** : surcharge visuelle côté client ⇒ maquette validée avant développement.
- **Livrable** : dashboards DAF et client opérationnels sur données démo et réelles.

## Phase 5 — Rapports PDF

- **Objectif** : le client génère un rapport instantané et consulte les rapports validés.
- **Fonctionnalités** : moteur unique de rapports (modèles React), 3 modèles MVP, prévisualisation
  HTML, génération PDF serveur (Chromium dans le worker), couverture, sommaire, pagination,
  sources et limites, mode instantané/validé, versions figées, historique, journal des téléchargements.
- **Fichiers** : `reports/{templates,render,pdf}/*`, `jobs/render-report.ts`,
  `services/reporting/*`, `features/reporting/*`, `docs/reporting.md`.
- **Critères** : aucune donnée interne dans le PDF (test d'injection de marqueurs) ; montants
  identiques à l'écran ; version publiée immuable (hash vérifié).
- **Tests** : rendu (nombre de pages, sommaire), contenu (extraction texte du PDF), permissions.
- **Risques** : taille de l'image Docker (Chromium) et temps de rendu ⇒ job asynchrone + cache.
- **Livrable** : PDF professionnels téléchargeables par le DAF et le client.

## Phase 5b — Tranche MVP complémentaire

Trésorerie simple (soldes, catégorisation par règles simples, flux mensuels), recommandations,
plan d'action, commentaires internes/publics, documents et demandes de pièces.
Critère : cycle complet « import → SIG/KPI → rapport validé → recommandation → action suivie ».

## Phases 6 à 11 (post-MVP)

Détaillées au démarrage de chacune, selon le même gabarit. Ordre proposé :
6 Trésorerie complète (rapprochement, prévisions 30 j → 12 mois, flux connus/probables/hypothétiques)
→ 7 Budget et contrôle de gestion → 8 Missions, planning, rendez-vous → 9 Règles d'automatisation,
alertes, imports récurrents → 10 Business plan et financement → 11 Industrialisation SaaS.

Note : si votre premier client exige un budget vs réalisé dès le départ, la Phase 7 (version réduite :
budget annuel mensualisé par rubrique SIG + écarts) peut être avancée juste après la Phase 5 — voir D-08.
