# Registre des décisions

Format : contexte → options → recommandation → statut.
Statuts : `proposée` · `validée` · `rejetée` · `remplacée`.

| ID | Décision | Recommandation | Statut |
|---|---|---|---|
| D-01 | Hébergement base + application | PostgreSQL managé en UE + conteneurs (app + worker) en UE | **à valider** |
| D-02 | Authentification | Better Auth (sessions en base) — Supabase Auth si D-01 = Supabase | **à valider** |
| D-03 | Accès données / migrations | Drizzle ORM + SQL versionné + RLS | proposée |
| D-04 | Architecture | Monolithe modulaire Next.js + worker pg-boss, pas de microservice | proposée |
| D-05 | Représentation des montants | `numeric(18,2)` + decimal.js, jamais de flottant | proposée |
| D-06 | Source comptable prioritaire | FEC + export balance du logiciel de l'expert-comptable du 1er client | **à préciser** |
| D-07 | Lecture XLSX | exceljs (MIT, dernière version 2023) vs SheetJS CE (Apache-2.0, distribué hors npm) — choix à l'implémentation Phase 2 après test | proposée |
| D-08 | Budget dans le MVP | Hors MVP, avançable juste après Phase 5 | **à valider** |
| D-09 | PDF | HTML/React rendu par Chromium headless côté serveur (worker) | proposée |
| D-10 | Multi-tenant | Base partagée, `company_id` partout, scoping applicatif + RLS | proposée |
| D-11 | Référentiel SIG | Versionné par date d'ouverture d'exercice (PCG avant/après ANC 2022-06) | proposée |

## D-01 — Hébergement

- **Contexte** : données financières de clients ⇒ RGPD, hébergement UE, sauvegardes, restauration.
  Chromium (PDF) et worker de jobs ⇒ processus longue durée, incompatibles avec du 100 % serverless.
- **Options** :
  1. *Supabase (région UE)* : Postgres + Auth + Storage + sauvegardes intégrés ; le plus rapide à
     démarrer ; dépendance fournisseur modérée (Postgres standard). Application + worker à héberger
     ailleurs (conteneurs).
  2. *PostgreSQL managé français (Scaleway, OVHcloud, Clever Cloud…) + conteneurs* : souveraineté
     et argument commercial « hébergé en France » ; un peu plus de configuration (stockage S3, auth).
- **Recommandation** : option 2 si l'argument « hébergé en France » compte pour vos clients ;
  option 1 sinon. Le code reste portable dans les deux cas (Drizzle + Postgres standard).

## D-02 — Authentification

Better Auth : bibliothèque MIT, tables dans notre base, 2FA, invitations ; pas de service tiers.
Supabase Auth : géré, mais couple identité et hébergement. Lié à D-01.

## D-06 — Source comptable

Le FEC est normé et disponible chez tout expert-comptable ; c'est la source la plus fiable pour
dériver balances mensuelles et SIG. La balance seule convient pour un suivi annuel ou trimestriel
mais rend le mensuel dépendant de balances intermédiaires. À préciser : logiciel utilisé par
l'expert-comptable du premier client et fréquence de mise à disposition.

## D-08 — Budget dans le MVP

Le budget vs réalisé est souvent attendu dans une mission de pilotage mensuel. Le MVP le place
juste après le reporting pour ne pas retarder la fiabilisation du SIG, qui conditionne le budget
(le réalisé est lu dans le SIG).
