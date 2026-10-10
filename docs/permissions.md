# Rôles et permissions

> Statut : **v1.0 — appliquée en Phase 1**. Source de vérité du code : `domain/permissions/matrix.ts`
> (testée par `tests/unit/permissions.test.ts`).

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
   (`companies.enabled_modules`).

## Application en base (Phase 1)

| Table | Lecture | Écriture |
|---|---|---|
| `firms` | membres du cabinet ; clients d'une entreprise du cabinet | admin du cabinet (nom, SIREN) |
| `users` | soi ; collègues du cabinet ; clients des entreprises suivies ; DAF de ses entreprises | soi (nom uniquement) |
| `firm_members` | soi ; membres du même cabinet | admin du cabinet |
| `companies` | `can_access_company` (admin, collaborateur affecté, client d'une entreprise non archivée) | admin du cabinet ; `firm_id` non modifiable |
| `company_members` | soi ; personnel ayant accès | admin du cabinet |
| `company_advisors` | soi ; personnel ayant accès | admin ; uniquement des membres du même cabinet |
| `invitations` | admin du cabinet | admin (création, révocation) ; acceptation via `app.accept_invitation` |
| `audit_log` | admin du cabinet ; personnel de l'entreprise | insertion au nom de soi-même ; jamais de modification ni suppression |

Un utilisateur désactivé (`users.disabled_at`) perd immédiatement tout accès. Un refus d'accès
applicatif est journalisé (`outcome = denied`) et rendu comme une page 404.

## Application en base (Phase 3 — SIG)

| Table | Lecture | Écriture |
|---|---|---|
| `sig_account_overrides` | personnel du cabinet ayant accès à l'entreprise | administrateur du cabinet (création, remplacement) ; jamais de modification ni de suppression |
| `sig_rule_set_approvals` | membres du cabinet | administrateur du cabinet |
| `sig_snapshots` | personnel ayant accès ; clients : **versions publiées uniquement** | insertion par le personnel (statut « validé ») ; publication par l'administrateur, si le référentiel est validé ; immuable sinon |
