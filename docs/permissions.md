# Rôles et permissions

> Statut : **proposition v0.1 — en attente de validation**.

## Rôles

| Rôle | Portée | Description |
|---|---|---|
| `platform_admin` | technique | Exploitation. **Aucun accès aux données métier** par défaut ; accès exceptionnel tracé. |
| `firm_admin` | cabinet | Gère entreprises, collaborateurs, missions, paramètres ; accède à toutes les entreprises du cabinet. |
| `firm_analyst` | entreprises affectées | Analyse et prépare les livrables ; publication selon délégation. |
| `client_owner` | son/ses entreprise(s) | Dirigeant : consultation, rapports, mise à jour des actions autorisées, documents. |
| `client_member` | son entreprise | Accès limité aux modules ouverts par le DAF. |
| `client_readonly` | son entreprise | Consultation seule, sans export par défaut. |

## Verbes

`read` · `create` · `update` · `validate` · `publish` · `export` · `admin`

## Matrice (MVP)

| Ressource | firm_admin | firm_analyst | client_owner | client_member | client_readonly |
|---|---|---|---|---|---|
| Entreprise (fiche, paramètres) | read/create/update/admin | read | read (fiche) | read (fiche) | read (fiche) |
| Membres client / invitations | admin | create (si délégué) | — | — | — |
| Imports | tout | read/create/update/validate | create (dépôt de fichier) | create (si autorisé) | — |
| Balances, écritures, transactions | read/update/validate | read/update/validate | — | — | — |
| Règles de mapping SIG | admin | read (update si délégué) | — | — | — |
| SIG | read/validate/publish | read/validate | read publiés | read publiés (si module ouvert) | read publiés |
| KPI | read/update/publish | read/update | read visibles | read visibles | read visibles |
| Trésorerie | read/update | read/update | read | read (si ouvert) | read |
| Rapport instantané | read/create/export | read/create/export | create/export | create/export (si ouvert) | — |
| Rapport validé | validate/publish/export | create/validate | read/export publiés | read/export publiés | read publiés |
| Recommandations | tout | create/update (publish si délégué) | read publiées | read publiées | read publiées |
| Actions | tout | tout | read + update si `client_can_update` | idem | read |
| Commentaires internes / notes | read/create | read/create | **jamais** | **jamais** | **jamais** |
| Documents `internal` | tout | tout | **jamais** | **jamais** | **jamais** |
| Documents `client` | tout | tout | read/create | read/create (si ouvert) | read |
| Journal d'audit | read | read (ses entreprises) | — | — | — |

## Règles d'application

1. Toutes les vérifications sont faites **côté serveur** (services) ; l'interface ne fait que masquer.
2. RLS PostgreSQL garantit l'isolation par entreprise même en cas d'oubli applicatif.
3. Un refus est journalisé (`audit_log.outcome = denied`).
4. Les rapports et exports passent par les mêmes contrôles que l'affichage.
5. Les modules visibles côté client dépendent à la fois du rôle et des prestations souscrites
   (`companies.settings.enabled_modules`).
