# Registre des décisions

Format : contexte → options → décision → conséquences.
Statuts : `proposée` · `validée` · `rejetée` · `remplacée`.

| ID | Décision | Statut |
|---|---|---|
| D-01 | Supabase (PostgreSQL, Auth, Storage), région Paris `eu-west-3`, architecture portable | **validée** (2026-10-09) |
| D-02 | Authentification Supabase Auth, encapsulée derrière une interface interne | **validée** (2026-10-09) |
| D-03 | Drizzle ORM + migrations SQL versionnées, appliquées par notre propre script | validée (avec D-01) |
| D-04 | Monolithe modulaire Next.js + worker de jobs, pas de microservice | validée |
| D-05 | Montants `numeric(18,2)` en base, decimal.js en TypeScript | validée |
| D-06 | Aucune dépendance à un logiciel comptable : balances CSV/XLSX, FEC, banque CSV/XLSX + correspondances par entreprise | **validée** (2026-10-09) |
| D-07 | Lecteur XLSX : `read-excel-file` (MIT, lecture seule, nombres lus en texte exact) | appliquée en Phase 2 |
| D-08 | Budget vs réalisé après les premiers PDF ; modèle de données budgétaire prévu dès le départ | **validée** (2026-10-09) |
| D-09 | PDF : HTML/React rendu par Chromium headless côté serveur | proposée |
| D-10 | Multi-tenant : base partagée, `company_id` partout, scoping applicatif + RLS | validée |
| D-11 | Référentiel PCG versionné par date d'ouverture d'exercice | **validée** (2026-10-09) |
| D-12 | Next.js 16 : `cacheComponents` désactivé ; pages authentifiées rendues dynamiquement | **validée** (2026-10-09) |
| D-13 | Tables applicatives dans le schéma PostgreSQL `app`, non exposé par l'API Data de Supabase | **validée** (2026-10-09) |
| D-14 | Invitations par lien à usage unique, sans envoi d'e-mail en Phase 1 | **validée** (2026-10-09) |
| D-15 | 2FA (TOTP) obligatoire pour les utilisateurs du cabinet | **validée** (2026-10-09) |
| D-16 | Imports traités de façon synchrone (pas encore de file de tâches) | appliquée en Phase 2 |
| D-17 | Conservation du brut : fichier original + lignes en anomalie, pas de copie ligne à ligne | appliquée en Phase 2 |

Paramètres généraux validés : devise **EUR**, langue **français**, référentiel **PCG français versionné**,
multi-entreprises, deux interfaces (DAF / client), moteur financier partagé, sécurité et traçabilité prioritaires.

## D-01 — Hébergement : Supabase, région Paris, portabilité

- **Décision** : Supabase pour PostgreSQL, l'authentification et le stockage de fichiers ; projet créé
  en région **West EU (Paris) — `eu-west-3`**, qui figure dans la liste officielle des régions Supabase.
- **Exigence de portabilité** — mesures prises dans le code :
  1. L'application n'utilise **pas** l'API Data (PostgREST) de Supabase : toutes les requêtes passent par
     Drizzle sur une connexion PostgreSQL standard (`DATABASE_URL`).
  2. Les tables métier sont dans le schéma `app` ; aucune clé étrangère vers `auth.users` ; aucune
     fonction ou politique ne dépend de `auth.uid()`. Les politiques RLS lisent `app.current_user_id()`,
     alimenté par l'application à chaque transaction.
  3. Les migrations sont des fichiers SQL générés par drizzle-kit et appliqués par `npm run db:migrate`
     sur n'importe quel PostgreSQL ≥ 16 (testé en CI sur PostgreSQL « nu »).
  4. L'authentification est encapsulée dans `lib/auth/` : seul ce dossier importe `@supabase/*`.
     Changer de fournisseur = réécrire ce dossier + migrer les comptes (identifiants `uuid` conservés).
  5. Le stockage de fichiers (Phase 2) sera encapsulé derrière une interface `StorageProvider`
     (Supabase Storage aujourd'hui, tout stockage compatible S3 demain).
- Localisation des données, sauvegardes et traitements : voir `docs/hosting.md`.

## D-02 — Authentification

Supabase Auth (e-mail + mot de passe, TOTP). Les sessions sont gérées par cookies via `@supabase/ssr`.
Chaque requête serveur revalide l'utilisateur auprès du serveur d'authentification (`getUser()`), jamais
uniquement à partir du cookie. Les rôles métier ne sont **pas** stockés dans le jeton : ils sont lus dans
la base (`app.firm_members`, `app.company_members`) à chaque requête.

## D-06 — Sources comptables indépendantes

- Le MVP accepte : balances comptables CSV/XLSX, FEC, transactions bancaires CSV/XLSX.
- Correspondance des **colonnes** (modèles sauvegardés par entreprise ou au niveau cabinet) et des
  **comptes** (plan de comptes de l'entreprise → référentiel PCG / rubriques), règles sauvegardées par
  entreprise.
- Une entreprise peut utiliser le portail avec des sources partielles : chaque indicateur déclare les
  sources qu'il requiert ; s'il manque une source, il est affiché **« Données insuffisantes »** avec la
  source manquante (ex. « Balance comptable non importée pour cette période »).

## D-08 — Budget

Développement du budget vs réalisé après la Phase 5. Le modèle de données (`docs/data-model.md` § 10)
définit dès maintenant budgets, versions (initial, révisé, reforecast), ventilation mensuelle et annuelle,
lignes rattachées aux rubriques SIG / comptes / catégories, afin d'éviter toute refonte ultérieure.

## D-11 — Référentiel PCG versionné

Le règlement ANC n° 2022-06 modifie le PCG pour les exercices ouverts à compter du 1er janvier 2025.
Les jeux de règles SIG sont versionnés et sélectionnés selon la date d'ouverture de l'exercice.

## D-12 — Cache Next.js

Next.js 16 propose `cacheComponents` (activé par défaut dans le gabarit). Pour une application dont
quasiment toutes les pages dépendent de l'utilisateur et de l'entreprise, le risque de servir une donnée
mise en cache à un mauvais utilisateur l'emporte sur le gain de performance. Désactivé pour le MVP ;
réévaluation en Phase 11 avec des tests d'isolation dédiés.

## D-13 — Schéma `app`

Supabase expose par défaut le schéma `public` via son API REST avec la clé publique. Placer les tables
métier dans `app` (non exposé) supprime cette surface d'attaque ; la RLS reste active en défense en
profondeur.

## D-14 — Invitations

Le DAF génère un lien d'invitation à usage unique (jeton aléatoire, stocké haché, expiration 7 jours)
et le transmet lui-même. L'envoi d'e-mails transactionnels (fournisseur SMTP UE) est reporté.

## D-15 — 2FA

TOTP obligatoire pour les rôles cabinet avant tout accès à l'espace DAF. Recommandé mais facultatif
pour les clients.

## D-07 — Lecture des fichiers XLSX

`read-excel-file` 9.3.10 (MIT) : lecture seule, maintenu, sans le paquet `xlsx` publié sur npm
(0.18.5, figé et visé par des vulnérabilités connues) ni `exceljs` (sans nouvelle version depuis 2023).
Les nombres sont récupérés sous forme de texte exact (`parseNumber`), jamais via un flottant ;
les artefacts binaires (ex. `1234.5600000000001`) sont arrondis au centime, une vraie troisième
décimale est rejetée. Les classeurs `.xls` (Excel 97-2003) sont refusés avec un message explicite.

## D-16 — Imports synchrones

La roadmap prévoyait une file de tâches (pg-boss) dès la Phase 2. Mesure : un FEC de 100 000 lignes
(9,9 Mo) est analysé en ~2 s et enregistré en ~10 s (dont ~5 s d'insertion PostgreSQL), dans la limite
d'une requête. Un FEC de TPE (5 000 à 30 000 lignes) se valide en 1 à 3 s. La file de tâches est donc
reportée à la Phase 5 (génération PDF), où elle devient indispensable ; l'import y sera alors rattaché.
Test de non-régression : `tests/integration/imports-volume.test.ts` (seuil 30 s).

## D-17 — Conservation des données brutes

Le fichier original est conservé à l'identique dans le stockage (clé = empreinte SHA-256, vérifiée
à chaque relecture). Chaque donnée normalisée porte son numéro de ligne source (`source_row`) et son
import d'origine. `import_rows` ne stocke que les lignes en anomalie, exclues ou rejetées comme
doublons (avec leur contenu brut et les messages), au lieu de dupliquer tout le fichier en base.
Les données importées ne sont ni modifiables ni supprimables par l'application : une correction
passe par un nouvel import qui remplace explicitement le précédent (historique conservé).
