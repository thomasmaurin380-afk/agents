# Roadmap

> Statut : **validée le 2026-10-09**.
> Le MVP (`docs/mvp.md`) = phases 1 à 5, plus une tranche réduite des phases 6 et 8.

## Avancement

| Phase | Intitulé | Statut |
|---|---|---|
| 0 | Analyse d'architecture et définition du MVP | ✅ validée |
| 1 | Architecture et fondations | ✅ validée |
| 2 | Onboarding et collecte | ✅ livrée le 2026-10-09 (en attente de votre recette) |
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
- **Fichiers principaux (réels)** : `app/(auth)`, `app/mfa`, `app/invitation/[token]`, `app/daf/**`,
  `app/client/**`, `proxy.ts`, `lib/auth/*` (seul point de dépendance à Supabase), `lib/db/{client,tenant}.ts`,
  `db/schema/{identity,tenancy,audit}.ts`, `db/migrations/{0000_init,0001_rls}.sql`, `services/*`,
  `repositories/*`, `domain/{money,company,permissions,indicators,shared}`, `tests/{unit,integration,e2e}`,
  `docker/compose.test.yml`, `.env.example`, `.github/workflows/ci.yml`.
- **Dépendances** : D-01 (Supabase), D-02 (Supabase Auth), D-03 (Drizzle), D-05, D-12 à D-15.
- **Hors périmètre Phase 1** : stockage de fichiers, exercices et plan de comptes (Phase 2), toute donnée financière.
- **Critères d'acceptation** : un DAF voit le portefeuille ; un dirigeant ne voit que son entreprise ;
  accès direct à l'URL d'une autre entreprise ⇒ 404/403 + audit ; RLS bloque une requête SQL non
  scopée ; CI verte.
- **Tests** : unitaires `domain/money` ; intégration RLS (rôle applicatif, deux tenants) ;
  E2E Playwright connexion DAF / client / tentative d'accès croisé.
- **Risques** : RLS mal branchée avec le pool de connexions (⇒ `set_config` local à la transaction,
  testé) ; disponibilité/licence Efferd non vérifiée (⇒ composants shadcn standard en repli).
- **Livrable** : application déployable localement, deux espaces, isolation testée.

### Résultat Phase 1 (2026-10-09)

Livré : connexion, 2FA TOTP obligatoire pour le cabinet, invitations par lien à usage unique (clients
et collaborateurs), cabinet / entreprises / rôles, RLS PostgreSQL + contrôle applicatif + audit
append-only, espace DAF (portefeuille, création et fiche entreprise, affectations, équipe), portail
client (accueil, DAF référent, « Données insuffisantes »), aperçu client depuis l'espace DAF,
thème clair/sombre, responsive, démo réinitialisable (3 entreprises, 5 comptes), CI.

Tests exécutés (environnement de développement) :

| Suite | Résultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` (dont frontières de modules) | ✅ |
| `npm test` — unitaires | ✅ 23/23 |
| `npm run test:integration` — Supabase PostgreSQL 17 | ✅ 49/49 |
| `npm run test:integration` — PostgreSQL 16 standard (portabilité) | ✅ 49/49 |
| `npm run build` (sans secret) | ✅ |
| `npm run test:e2e` — Playwright, build de production | ✅ 9/9 |

Défauts trouvés et corrigés par les tests : `INSERT … RETURNING` incompatible avec la politique de
lecture des entreprises (identifiant désormais généré côté application) ; ambiguïté de colonnes dans
`accept_invitation` ; formulaires vidés après une erreur de validation.

Limites connues : la CI GitHub n'a pas encore tourné (premier push) ; composants Efferd non vérifiés
(domaine inaccessible) — composants maison au style shadcn/ui ; pas d'envoi d'e-mail (D-14) ;
en-tête CSP limité à `frame-ancestors`/`form-action` (CSP complète avec nonce : Phase 11) ;
pas de limitation applicative du nombre de tentatives de connexion au-delà de celle de Supabase Auth.

## Phase 2 — Onboarding et collecte

- **Objectif** : données financières importables, persistantes, traçables.
- **Fonctionnalités** : complétion du dossier entreprise (exercices, plan de comptes) ; `StorageProvider` ;
  correspondance des **comptes** (plan de comptes entreprise → PCG) sauvegardée par entreprise ;
  moteur d'import générique (téléversement → analyse → colonnes → correspondance → prévisualisation
  → contrôles → doublons → validation → enregistrement → rapport) ; parseurs CSV, XLSX, FEC ;
  balance générale ; transactions bancaires ; modèles de correspondance ; conservation du brut.
- **Fichiers (réels)** : `domain/imports/*`, `lib/imports/read-table.ts`, `lib/storage/*`, `services/{imports,company-data}.ts`,
  `repositories/{imports,accounting,bank-accounts,fiscal-years}.ts`, `features/data/*`, `app/daf/c/[companyId]/{data,imports,accounts}`,
  `db/schema/{imports,accounting,treasury}.ts`, `db/migrations/000{2,3}_*.sql`, `scripts/demo/generate-files.ts`.
- **Dépendances** : Phase 1 ; stockage objet (Supabase Storage).
- **Critères** : balance équilibrée (Σ D = Σ C) sinon rejet explicite ; FEC conforme aux 18 colonnes
  sinon rapport d'erreurs ligne à ligne ; réimport identique ⇒ 0 doublon ; données brutes intactes.
- **Tests** : fixtures FEC (tabulation et `|`), CSV séparateur `;` + décimales à virgule, encodages
  UTF-8/ISO-8859-1, fichiers malformés, doublons, gros fichier (100 000 lignes) en job.
- **Risques** : diversité des exports logiciels (⇒ modèles de correspondance, D-06) ; montants au
  format français mal parsés (⇒ parseur dédié testé).
- **Livrable** : import d'une vraie balance et d'un vrai relevé avec rapport d'import.

### Résultat Phase 2 (2026-10-09)

Livré : exercices (décalés, sans chevauchement), comptes bancaires, moteur d'import (CSV/TXT/XLSX,
détection d'encodage, de séparateur, de ligne d'en-tête et de séparateur décimal), balances (3 modes de
soldes, à-nouveaux et mouvements facultatifs), FEC (18 colonnes, variantes Débit/Crédit et Montant/Sens),
relevés bancaires (montant signé ou débit/crédit, contrôle du solde courant), correspondance des colonnes
proposée puis modifiable et mémorisée par entreprise, aperçu normalisé, contrôles bloquants et
avertissements ligne à ligne, doublons (fichier identique refusé ; opérations bancaires déjà connues
ignorées), remplacement explicite d'une balance ou d'un FEC (historique conservé), plan de comptes
rattaché au PCG (automatique, règles, manuel), rapport d'import, audit, disponibilité des sources
propagée aux indicateurs (DAF et dirigeant), fichiers de démonstration cohérents (`demo-files/`).

Écarts assumés : pas de file de tâches (D-16) ; `import_rows` limité aux lignes en anomalie (D-17) ;
le dépôt de fichiers par le dirigeant est reporté au module Documents (5b).

Tests exécutés :

| Suite | Résultat |
|---|---|
| `npm run typecheck`, `npm run lint` | ✅ |
| `npm test` — unitaires (dont 40 sur le moteur d'import et les fichiers de démo) | ✅ 63/63 |
| `npm run test:integration` (dont 21 Phase 2, volumétrie 100 000 lignes comprise) — Supabase PG 17 et PostgreSQL 16 standard | ✅ 70/70 |
| `npm run build` | ✅ |
| `npm run test:e2e` — Playwright (9 Phase 1 + 7 Phase 2) | ✅ 16/16 |

Défauts trouvés et corrigés par les tests : droit manquant pour mettre à jour une règle de
rattachement ; compteur d'opérations bancaires toujours à 0 (colonne non qualifiée dans une
sous-requête) ; validation de 100 000 lignes en 41 s ramenée à 10 s (politiques RLS évaluées une fois
par instruction, insertion en masse des écritures).

### Fiabilisation Phase 2 (2026-10-10)

Livré : suppression définitive d'un import enregistré (balance, FEC, relevé) avec fenêtre de confirmation
(volumes, conséquences, saisie de SUPPRIMER), réservée à l'administrateur DAF, atomique et journalisée
(D-18, D-19) ; libellés distincts Annuler / Supprimer / Remplacer ; statuts expliqués (« Enregistré » ≠
validation métier) ; parcours en étapes ; anomalies regroupées (bloquantes, avertissements, doublons)
avec ligne, colonne et résultat attendu ; modèles de colonnes revérifiés avant réutilisation ; sens des
opérations bancaires (encaissement / décaissement / à vérifier), sans catégorie inventée ; signalement des
opérations connues absentes d'un nouveau relevé ; panneau des sources disponibles pour les SIG et KPI.

Migration à appliquer : `0004_import_deletion.sql` (workflow « Migrations Supabase Demo »).

Reporté : réimport automatique après blocage d'une suppression bancaire ; suppression d'un import annulé
(fichier conservé) ; catégorisation des opérations (phase 5b) ; file de tâches pour les très gros imports (D-16).

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
- **Critères** : sources partielles ⇒ « Données insuffisantes » + source manquante ; chaque KPI affiche valeur, période, comparaison, définition, formule, provenance,
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
- **Rapports instantanés client** : génération en libre-service, bandeau « non validé par votre DAF »,
  couverture distincte ; rapports validés figés avec mention du validateur et de la date.
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
