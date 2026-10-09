# Architecture — Plateforme DAF externalisé

> Statut : **proposition v0.1 — en attente de validation** (voir `docs/decisions.md`).
> Date : 2026-10-09.

## 1. État actuel vérifié

| Élément | Constat |
|---|---|
| Code applicatif | Aucun. Le dépôt ne contient aucun `package.json`, aucune source, aucune migration. |
| Contenu existant | 4 sous-agents Claude Code dans `.claude/agents/` : `architecte`, `directeur-operations`, `expert-tresorerie`, `ingenieur-outils-financiers`. |
| Conséquence | Démarrage « from scratch ». Les agents existants servent d'appui méthodologique (règles métier, contrôle qualité), pas de base de code. |
| Environnement | Node.js 22, npm 10, PostgreSQL client (`psql`) et Docker disponibles dans l'environnement de développement. |

Versions relevées sur le registre npm le 2026-10-09 (à revérifier au moment de l'installation) :
Next.js 16.4, React 19.3, Tailwind CSS 4.3, Zod 4.6, Drizzle ORM 0.45, Better Auth 1.7, pg-boss 12.37,
decimal.js 10.6, Recharts 3.10, Vitest 5.0, Playwright 1.64. Toutes sous licence MIT ou Apache-2.0.

Composants Efferd (`efferd.com/r/new-york/dashboard-*.json`) : **non vérifiés** — le domaine est bloqué
par le proxy réseau de l'environnement. Disponibilité et licence à contrôler avant usage (Phase 1).

## 2. Cartographie des deux interfaces

Une seule application, un seul moteur financier, deux « espaces » distingués par le routage,
la navigation et les permissions.

```
                         ┌─────────────────────────────┐
                         │   Authentification unique   │
                         └──────────────┬──────────────┘
                 rôle cabinet           │            rôle client
           ┌────────────────────────────┴───────────────────────────┐
           ▼                                                        ▼
  /daf  — ESPACE DAF                                     /client — PORTAIL DIRIGEANT
  ├─ Portefeuille (multi-entreprises)                    ├─ Accueil (synthèse pédagogique)
  ├─ Planning / missions (transversal)                   ├─ Mes KPI           (publiés)
  └─ /daf/c/[companyId]/…  (fiche entreprise)            ├─ Mes SIG           (publiés)
       ├─ Tableau de bord                                ├─ Ma trésorerie
       ├─ KPI            ├─ SIG                          ├─ Mon budget
       ├─ Comptabilité importée                          ├─ Mes rapports (instantané + validés)
       ├─ Trésorerie / banque                            ├─ Recommandations
       ├─ Budget / rentabilité                           ├─ Actions
       ├─ Business plan / financement                    ├─ Documents (dépôt / demandes)
       ├─ Rapports (préparation, validation, publication)├─ Rendez-vous / comptes rendus
       ├─ Recommandations / actions                      └─ Paramètres
       ├─ Documents      ├─ Rendez-vous
       ├─ Automatisations / imports / contrôles
       ├─ Notes internes (jamais exposées au client)
       └─ Paramètres entreprise (KPI visibles, seuils…)
           │                                                        │
           └──────────────────────┬─────────────────────────────────┘
                                  ▼
          Services applicatifs (contrôle d'accès, orchestration, audit)
                                  ▼
          Domaine : moteur financier pur (SIG, KPI, trésorerie, écarts)
                                  ▼
          Repositories (requêtes toujours scopées par entreprise) + RLS PostgreSQL
```

Principe de cohérence DAF/client : le client ne lit **que** des données publiées ou des calculs
produits par le même moteur, sur les mêmes données. Il n'existe pas de « vue client » calculée
différemment ; seule la *visibilité* change (filtre de publication + permissions).

### Correspondance des écrans

| Besoin | Écran DAF | Écran client | Source |
|---|---|---|---|
| Synthèse | `/daf/c/[id]/dashboard` | `/client/[id]` | `financial-engine` |
| KPI | `/daf/c/[id]/kpi` (tous, définitions, seuils) | `/client/[id]/kpi` (KPI marqués visibles) | `kpi` |
| SIG | `/daf/c/[id]/sig` (+ drill-down comptes, règles) | `/client/[id]/sig` (dernier SIG publié) | `sig` |
| Trésorerie | `/daf/c/[id]/treasury` | `/client/[id]/treasury` | `treasury` |
| Rapports | préparation / validation / publication | génération instantanée + téléchargement des validés | `reporting` |
| Recommandations / actions | création, publication, supervision | consultation, mise à jour des actions autorisées | `advisory` |
| Documents | demandes, classement, visibilité | dépôt, réponses aux demandes | `documents` |

## 3. Architecture technique recommandée

**Monolithe modulaire Next.js + PostgreSQL + un processus worker**, sans microservice.

| Couche | Choix recommandé | Justification |
|---|---|---|
| UI | Next.js (App Router), React, TypeScript strict, Tailwind, shadcn/ui, Recharts | Imposé par le cahier des charges ; écosystème stable. |
| Validation | Zod à chaque frontière (formulaires, Server Actions, imports, API) | Une seule source de schémas. |
| Accès données | **Drizzle ORM** + migrations SQL versionnées (`drizzle-kit`) | SQL explicite, typage fort, migrations lisibles, pas de moteur binaire. |
| Base | **PostgreSQL ≥ 16**, hébergé en UE | `numeric` exact, contraintes, RLS, JSONB pour les données brutes. |
| Isolation | Scoping applicatif obligatoire **+** Row Level Security PostgreSQL | Défense en profondeur (voir § 5). |
| Auth | **Better Auth** (sessions en base, 2FA TOTP) — ou Supabase Auth selon décision D-02 | Auto-hébergeable, données d'identité dans notre base. |
| Montants | `numeric(18,2)` en base, **decimal.js** en TypeScript, jamais de `number` flottant | Fiabilité absolue des calculs. |
| Fichiers | Stockage objet compatible S3 (UE), accès par URL signées courtes | Documents, imports bruts, PDF figés. |
| Tâches longues | **pg-boss** (file de tâches dans PostgreSQL) + processus `worker` | Pas de Redis ; jobs durables, retries, planification cron. |
| PDF | Rendu HTML/React côté serveur → **Chromium headless (Playwright)** dans le worker | Réutilise composants et graphiques ; A4, pagination, sommaire. |
| Imports | `papaparse` (CSV), lecteur XLSX à arbitrer (voir D-07), parseur FEC maison | FEC = format normé (art. A47 A-1 LPF), parseur dédié testé. |
| Tests | Vitest (unitaires/intégration), PostgreSQL de test via Docker, Playwright (E2E) | Tests financiers et d'isolation sur vraie base. |

Conséquence d'hébergement : Chromium et le worker excluent un hébergement 100 % serverless.
Recommandation : conteneurs (app + worker) sur un hébergeur UE + PostgreSQL managé UE (décision D-01).

## 4. Organisation du projet

```
app/                         Routes (App Router)
  (auth)/                    connexion, invitation, 2FA
  daf/                       espace DAF (layout + garde rôle cabinet)
    portfolio/  planning/
    c/[companyId]/…          fiche entreprise
  client/[companyId]/…       portail dirigeant (layout + garde membre)
  api/                       routes HTTP strictement nécessaires (téléchargements, webhooks)
components/                  UI réutilisable (ui/ = shadcn, charts/, kpi-card/, data-table/…)
features/                    modules fonctionnels : composants + server actions par module
  portfolio/ companies/ imports/ accounting/ sig/ kpi/ treasury/ budget/
  reporting/ advisory/ documents/ missions/ meetings/ alerts/ automation/
domain/                      RÈGLES MÉTIER PURES — aucun import Next.js, DB ou I/O
  money/                     Money, arrondis, devise
  period/                    périodes, exercices décalés, complétude
  accounting/                plan de comptes, balance, FEC (types + validations)
  sig/                       mapping comptes → rubriques, calcul SIG, contrôles
  kpi/                       catalogue, définitions, calculs, statut « données insuffisantes »
  treasury/                  soldes, flux, prévisions
  reconciliation/            moteur de propositions (phase 6)
services/                    cas d'usage : contrôle d'accès + orchestration + audit + transactions
repositories/                accès données, toujours paramétrés par TenantContext
lib/                         utilitaires transverses (db, auth, logger, storage, errors)
integrations/                connecteurs externes (banque, plateformes de facturation…) — plus tard
jobs/                        définitions pg-boss (imports lourds, PDF, recalculs, alertes)
reports/                     modèles de rapports (React) + moteur de rendu PDF
db/
  schema/                    schémas Drizzle par module
  migrations/                migrations SQL versionnées
  rls/                       politiques RLS
  seed/                      données de démonstration (fictives, réinitialisables)
tests/
  unit/ integration/ security/ e2e/ fixtures/
docs/
```

Règles de dépendance (vérifiées par lint `eslint-plugin-boundaries` ou équivalent) :

```
app → features → services → (domain, repositories) → lib
domain  ne dépend de rien d'autre que domain/ (fonctions pures, déterministes)
repositories ne contiennent aucune règle métier
reports → services (lecture) — jamais d'accès direct à la base
```

## 5. Multi-tenant et sécurité d'accès

Modèle : **base partagée, colonne `company_id` sur toute donnée métier**.

Trois barrières indépendantes :

1. **Service** : chaque cas d'usage commence par `authorize(ctx, permission, companyId)`.
   `TenantContext = { userId, firmId, companyId, roles, permissions }` est construit côté serveur
   à partir de la session ; jamais à partir d'un paramètre client non vérifié.
2. **Repository** : toutes les fonctions exigent un `TenantContext` et filtrent par `company_id`.
   Aucune fonction « findAll » non scopée n'existe (règle de revue + test).
3. **PostgreSQL RLS** : l'application se connecte avec un rôle **non propriétaire** des tables ;
   chaque transaction exécute `set_config('app.user_id', …, true)` ; les politiques vérifient
   l'appartenance via une fonction `app.can_access_company(company_id)`.
   Les migrations utilisent un rôle distinct.

Jobs et exports : le worker reçoit `{ companyId, requestedBy }`, reconstruit un `TenantContext`
et passe par les mêmes services. Pas de « mode admin » implicite.

Tests obligatoires (Phase 1) : pour chaque repository, un utilisateur de l'entreprise A ne peut
ni lire, ni modifier, ni exporter une donnée de l'entreprise B — testé au niveau service **et**
au niveau SQL brut (RLS seule).

Détail des rôles : `docs/permissions.md`.

## 6. Flux de données financières

Séparation logique en couches (cf. agent `architecte`) :

```
RAW            import_files, import_rows (contenu brut JSONB, hash, immuable)
   │  normalisation + contrôles (Zod, formats, doublons)
NORMALIZED     accounting_entries, trial_balance_lines, bank_transactions, invoices…
   │  règles de mapping versionnées (PCG → rubriques SIG, catégories)
MAPPING        account_mappings, categorization_rules, decisions de validation
   │  fonctions pures domain/
ENGINE         SIG, KPI, trésorerie, écarts → résultats + traçabilité (sources, règles, version)
   │  cache matérialisé (computed_results) invalidé par « data_version » de l'entreprise
ANALYTICS      kpi_values, sig_snapshots, alerts
   │  publication (gel)
PRESENTATION   écrans, report_versions (PDF figés + JSON des données figées)
```

Invariants :

- Les données brutes ne sont jamais modifiées ; une correction crée une nouvelle ligne normalisée
  liée à l'ancienne (`supersedes_id`) et une entrée d'audit.
- Tout résultat du moteur porte : période, périmètre, sources (ids d'import), version des règles,
  date de calcul, statut (`definitif` / `provisoire` / `donnees_insuffisantes`).
- Un montant manquant n'est jamais remplacé par 0 : le moteur renvoie un type
  `Result<Montant, InsufficientData>`.
- Réconciliation SIG : résultat net SIG = (Σ classe 7 − Σ classe 6) de la balance ; écart ≠ 0 ⇒
  anomalie bloquante pour la publication.
- Trésorerie (banque) et résultat (comptabilité) ne sont jamais additionnés ni substitués.

Invalidation : chaque import/correction incrémente `companies.data_version` ; les résultats en
cache dont la version est inférieure sont recalculés à la demande ou par job ciblé.

## 7. Frontières des modules

| Module | Responsabilité | Expose | Dépend de |
|---|---|---|---|
| `identity` | utilisateurs, sessions, invitations, rôles | `getSession`, `TenantContext` | — |
| `tenancy` | cabinet, entreprises, membres, droits | `authorize`, `listAccessibleCompanies` | identity |
| `imports` | téléversement, parsing, mapping colonnes, prévisualisation, dédoublonnage, rapport | `ImportJob`, modèles de correspondance | tenancy, storage |
| `accounting` | exercices, plan de comptes, balances, écritures, FEC | balances normalisées par période | imports |
| `sig` | mapping comptes→rubriques versionné, calcul, contrôles, drill-down | `SigTable`, anomalies | accounting, domain/sig |
| `kpi` | catalogue, définitions, objectifs, seuils, visibilité client | `KpiValue[]` | sig, treasury, accounting |
| `treasury` | comptes bancaires, transactions, soldes, flux, prévisions | `CashPosition`, `CashFlowSeries` | imports |
| `budget` | versions, ventilation, budget vs réalisé (MVP+) | `VarianceTable` | accounting, sig |
| `reporting` | modèles, génération instantanée, versions validées figées, PDF | `ReportVersion`, fichier PDF | sig, kpi, treasury, advisory |
| `advisory` | recommandations, plans d'action, commentaires publiés / internes | — | tenancy |
| `documents` | stockage, visibilité, demandes de pièces | — | tenancy, storage |
| `missions` | missions, modèles, tâches, planning (Phase 8) | — | tenancy |
| `alerts` | règles explicites, évaluation, statut (Phase 9) | — | kpi, treasury |
| `audit` | journal append-only | `audit.log(...)` | — (utilisé par tous) |

Un module n'accède jamais aux tables d'un autre : il passe par son service.

## 8. Chemin critique

```
Auth + tenancy + RLS ──► Imports génériques ──► Balance / FEC ──► Mapping PCG→SIG ──► Moteur SIG
       │                        │                                         │
       │                        └──► Transactions bancaires ──► Trésorerie │
       │                                                                   ▼
       └──────────────────────────────────────────────► KPI ──► Dashboards DAF & client
                                                                           ▼
                                                     Reporting PDF (instantané + validé)
```

Le moteur SIG est le maillon le plus risqué (règles PCG, versions réglementaires, réconciliation) ;
il est développé et testé sur jeux de référence **avant** toute interface riche.

Points d'attention réglementaires (à surveiller, sans en faire un blocage MVP) :

- **PCG** : le règlement ANC n° 2022-06 modifie le plan comptable pour les exercices ouverts à
  compter du 1er janvier 2025 (notamment résultat exceptionnel et suppression des comptes de
  transferts de charges). Le mapping SIG doit donc être **versionné par date d'ouverture d'exercice**.
- **Facturation électronique** : réception obligatoire pour toutes les entreprises depuis le
  1er septembre 2026, émission pour les PME/TPE/micro au 1er septembre 2027. La création native de
  factures reste hors MVP ; les plateformes agréées pourraient devenir une source d'import de
  factures (à étudier, Phase 9+).
- **Périmètre professionnel** : la plateforme analyse des comptes produits par ailleurs ; elle ne
  tient, ne révise ni ne présente les comptes (activités réservées à l'expertise comptable).
  Les écrans et rapports l'indiquent explicitement.
