# Plateforme DAF externalisé

Application SaaS de pilotage financier, contrôle de gestion et accompagnement des dirigeants
(indépendants, TPE, petites PME) : cockpit DAF multi-entreprises + portail client sécurisé,
reposant sur un moteur financier unique (SIG, KPI, trésorerie) et un reporting PDF à la demande.

## État

| Phase | Statut |
|---|---|
| 0 — Architecture et MVP | ✅ validée |
| 1 — Fondations (auth, multi-tenant, RLS, deux espaces, démo) | ✅ validée |
| 2 — Imports comptables et bancaires (balance, FEC, relevés) | ✅ livrée — voir `docs/roadmap.md` |
| 3 — Moteur financier et SIG | à venir |

Les balances, FEC et relevés bancaires sont importables et contrôlés ; les indicateurs seront
calculés en phase 3-4. D'ici là, aucune valeur n'est affichée ni estimée.

Fichiers de démonstration fictifs et cohérents (FEC 2025, balance au 31/12/2025, relevés CSV et XLSX) :
`demo-files/`, régénérables avec `npx tsx scripts/demo/generate-files.ts`. Parcours : fiche
« Atelier Numérique » → Données comptables → créer l'exercice 2025 et un compte bancaire → Nouvel import.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · composants style shadcn/ui ·
PostgreSQL (Supabase, région Paris) · Drizzle ORM · Supabase Auth (TOTP) · Zod · decimal.js ·
Vitest · Playwright. Détails et justifications : `docs/architecture.md`, `docs/decisions.md`.

## Démarrage local

Prérequis : Node.js 22, Docker.

### Option A — Supabase CLI (recommandé sur votre poste)

```bash
npm ci
npx supabase start                 # PostgreSQL + Auth + Storage en local
cp .env.example .env.local         # renseigner les clés affichées par « supabase start »
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
npm run db:migrate
npm run db:seed:demo               # données fictives réinitialisables
npm run dev                        # http://127.0.0.1:3000
```

### Option B — pile de test minimale (PostgreSQL Supabase + Auth uniquement)

```bash
npm ci
npm run stack:up                   # docker/compose.test.yml (PostgreSQL, Auth, Storage)
npm run dev:gateway &              # routage /auth/v1 et /storage/v1 (remplace la passerelle Supabase)
cp .env.test .env.local            # valeurs de TEST uniquement ; adapter APP_URL=http://127.0.0.1:3000
npm run db:migrate && npm run db:seed:demo
npm run dev
```

### Comptes de démonstration

Mot de passe commun : `DemoDaf-2026-Pilotage` (local uniquement ; seed refusé en production).

| Compte | Profil |
|---|---|
| `daf.admin@demo.invalid` | Administrateur DAF (2FA demandée à la 1re connexion) |
| `daf.analyste@demo.invalid` | Collaborateur DAF, affecté à 2 entreprises sur 3 |
| `dirigeant.services@demo.invalid` | Dirigeant — société de services |
| `dirigeante.commerce@demo.invalid` | Dirigeante — entreprise commerciale (exercice décalé) |
| `dirigeant.artisan@demo.invalid` | Dirigeant — entreprise artisanale |

## Migrations à appliquer après un déploiement

Les migrations ne sont jamais lancées automatiquement sur la base hébergée. Après le push :
GitHub → Actions → « Migrations Supabase Demo » → *Run workflow* sur `claude/happy-heisenberg-9gena5`,
saisir `MIGRER_DEMO`. Dernière migration : `0004_import_deletion.sql` (suppression sécurisée des imports,
file de nettoyage du stockage, sens des opérations bancaires avec reprise des données existantes).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run typecheck` | Types Next.js générés + `tsc` strict |
| `npm run lint` | ESLint, dont les règles de frontières entre modules |
| `npm test` | Tests unitaires (domaine) |
| `npm run test:integration` | RLS et services sur une base PostgreSQL dédiée `daf_it` (recréée) |
| `npm run test:e2e` | Playwright sur le build de production (nécessite `stack:up` + `build`) |
| `npm run build` | Build de production (aucun secret requis) |
| `npm run db:migrate` | Applique `db/migrations` (tout PostgreSQL ≥ 16) |
| `npm run db:seed:demo` | Crée / réinitialise la démonstration |

Nouvelle migration : modifier `db/schema/*`, puis `npx drizzle-kit generate --name <nom>`
(ou `--custom` pour du SQL : RLS, fonctions). **Une migration publiée n'est jamais modifiée.**
Toute nouvelle table métier : `company_id`, RLS activée, privilèges accordés explicitement à `app_runtime`.

## Documentation

| Document | Contenu |
|---|---|
| `docs/architecture.md` | Interfaces, stack, modules, multi-tenant, flux de données |
| `docs/data-model.md` | Modèle de données (✅ = tables existantes) |
| `docs/permissions.md` | Rôles, matrice, application en base |
| `docs/mvp.md` | Parcours prioritaire et critères d'acceptation du MVP |
| `docs/roadmap.md` | Phases, avancement, résultats de tests |
| `docs/decisions.md` | Décisions structurantes |
| `docs/hosting.md` | Localisation des données, sauvegardes, checklist de mise en production |

## Agents Claude Code du projet

`.claude/agents/` : `architecte`, `directeur-operations`, `expert-tresorerie`, `ingenieur-outils-financiers`.
