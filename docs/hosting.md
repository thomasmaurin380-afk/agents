# Hébergement, localisation des données et traitements

> Dernière vérification : 2026-10-09. Statut : **à compléter lors de la création du projet Supabase de production**.

## Sources consultées

- Liste officielle des régions Supabase (`supabase.com/docs/guides/platform/regions`) : la région
  **West EU (Paris) — `eu-west-3`** (AWS) est proposée.
- Guide RGPD Supabase (`supabase.com/docs/guides/security/gdpr-compliance`) : chaque projet est déployé
  dans **une région primaire** ; la base PostgreSQL, Auth et Storage y résident. Le guide précise que
  sauvegardes, journaux, exports, exécution des Edge Functions et sous-traitants peuvent affecter
  l'analyse de résidence et de transferts internationaux.
- Documentation des sauvegardes (`supabase.com/docs/guides/platform/backups`) : sauvegardes quotidiennes
  automatiques sur les offres payantes (rétention 7 jours en Pro, 14 en Team, jusqu'à 30 en Enterprise) ;
  PITR en option (sauvegardes physiques + archivage WAL toutes les 2 minutes).

Limite de la vérification : l'environnement de développement n'a pas pu ouvrir directement les pages
supabase.com (accès réseau filtré) ; les éléments ci-dessus proviennent des extraits de ces pages officielles
obtenus par recherche. **La région de stockage des sauvegardes n'est pas confirmée par une source officielle**
(seules des sources tierces indiquent « même région que le projet »).

## Synthèse

| Élément | Localisation | Statut |
|---|---|---|
| Base PostgreSQL (données financières, utilisateurs applicatifs) | `eu-west-3` (Paris) | confirmé par la doc officielle (région primaire) |
| Authentification (comptes, sessions, facteurs 2FA) | `eu-west-3` | confirmé (région primaire) |
| Stockage de fichiers (imports, documents, PDF) | `eu-west-3` | confirmé (région primaire) |
| Sauvegardes quotidiennes / PITR | probablement `eu-west-3` | **à confirmer** auprès de Supabase / DPA |
| Journaux de la plateforme Supabase | non documenté | **à confirmer** |
| Edge Functions | non utilisées | sans objet |
| Application Next.js + worker | hébergeur à choisir en UE (Phase 5 au plus tard, Chromium requis) | **à décider** |
| Envoi d'e-mails | non utilisé en Phase 1 | sans objet |
| Services d'IA | aucun | sans objet |

## Actions à réaliser avant la mise en production (checklist)

1. Créer le projet Supabase en **`eu-west-3`** et vérifier la région dans *Project Settings*.
2. Signer le **DPA** Supabase et archiver la liste des sous-traitants à la date de signature.
3. Demander confirmation écrite de la région de stockage des sauvegardes et des journaux.
4. Activer le PITR si la rétention quotidienne est jugée insuffisante.
5. Mettre en place une **sauvegarde logique indépendante** (`pg_dump` chiffré, stockage UE hors Supabase)
   et **tester la restauration** sur un PostgreSQL non-Supabase (prouve aussi la portabilité).
6. Héberger l'application et le worker en UE (idéalement France) ; consigner le choix ici.
7. Tenir le registre des traitements RGPD (finalités, durées de conservation, sous-traitants).

## Portabilité

Voir D-01 dans `docs/decisions.md`. Procédure de sortie de Supabase (à tester en Phase 11) :
`pg_dump` du schéma `app` → restauration sur PostgreSQL cible → `npm run db:migrate` (no-op attendu) →
migration des comptes d'authentification (identifiants `uuid` conservés) → copie des fichiers (S3).
