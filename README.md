# Plateforme DAF externalisé

Application SaaS de pilotage financier, contrôle de gestion et accompagnement des dirigeants
(indépendants, TPE, petites PME) : cockpit DAF multi-entreprises + portail client sécurisé,
reposant sur un moteur financier unique (SIG, KPI, trésorerie) et un reporting PDF à la demande.

## État

Phase 0 — architecture et définition du MVP **livrées, en attente de validation**.
Aucun code applicatif n'est encore développé.

## Documentation

| Document | Contenu |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Cartographie des deux interfaces, architecture technique, modules, multi-tenant, flux de données, chemin critique |
| [`docs/data-model.md`](docs/data-model.md) | Modèle de données initial |
| [`docs/permissions.md`](docs/permissions.md) | Rôles et matrice de permissions |
| [`docs/mvp.md`](docs/mvp.md) | Périmètre et critères d'acceptation du MVP |
| [`docs/roadmap.md`](docs/roadmap.md) | Phases, critères, tests, risques, avancement |
| [`docs/decisions.md`](docs/decisions.md) | Décisions structurantes (dont celles à valider) |

Documents prévus lors des phases concernées : `financial-rules.md`, `kpi-catalog.md`,
`sig-rules.md`, `automation-rules.md`, `reporting.md`, `.env.example`.

## Agents Claude Code du projet

`.claude/agents/` : `architecte`, `directeur-operations`, `expert-tresorerie`,
`ingenieur-outils-financiers`.

## Démarrage

Les instructions d'installation seront ajoutées en Phase 1.
