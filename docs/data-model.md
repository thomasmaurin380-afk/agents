# Modèle de données initial

> Statut : **v1.0 validée le 2026-10-09**. Les tables marquées ✅ existent (migrations Phase 1) ;
> les autres sont la cible des phases suivantes. Toutes les tables applicatives sont dans le schéma
> PostgreSQL `app` (D-13).

## Conventions

- PostgreSQL ≥ 16. Clés primaires `uuid` (`gen_random_uuid()`).
- **Toute table métier porte `company_id uuid not null`** (FK `companies`), indexée, soumise à RLS.
- Montants : `numeric(18,2)` ; taux et quantités : `numeric(18,6)`. Jamais de `float`/`real`.
- Devise : `char(3)` ISO 4217, défaut `EUR`. Aucune agrégation entre devises différentes.
- Dates comptables : `date` ; horodatages : `timestamptz` (UTC).
- Colonnes standard : `created_at`, `created_by`, `updated_at`, `updated_by`.
- Provenance : `source_import_id` (nullable) sur toute donnée importée.
- Suppression : logique (`archived_at`) pour les données métier ; jamais de suppression physique
  d'une donnée brute ou d'un rapport publié.
- Énumérations : types PostgreSQL `enum` ou `check` explicites.

## 1. Identité et multi-tenant

```
✅ firms                   cabinet DAF (prépare le SaaS : plusieurs cabinets possibles)
  id, name, siren?, is_demo

✅ users                   profil applicatif ; id = identifiant du compte d'authentification
  id, email unique, full_name, is_demo, disabled_at
  (comptes, mots de passe, sessions et facteurs 2FA : gérés par Supabase Auth, schéma `auth`,
   sans clé étrangère depuis `app` pour rester portable — D-01)

✅ firm_members            user_id, firm_id, role ∈ {firm_admin, firm_analyst}
                           unique(user_id, firm_id)

✅ companies               entreprise cliente
  id, firm_id, legal_name, trade_name, siren (9 chiffres, clé de Luhn), legal_form, naf_code, sector,
  currency default 'EUR' (check = 'EUR' au MVP), fiscal_year_start_month smallint (1–12),
  status ∈ {onboarding, active, paused, archived}, enabled_modules text[],
  lead_advisor_id → users, data_version bigint default 0, logo_file_id? (Phase 2)

✅ company_members         user_id, company_id,
                           role ∈ {client_owner, client_member, client_readonly}
                           (accès client à une entreprise)

✅ company_advisors        user_id, company_id      (affectation d'un collaborateur DAF
                                                     à une entreprise ; firm_admin voit tout)

✅ invitations             email, firm_id, company_id?, role, token_hash (SHA-256), expires_at,
                           accepted_at, accepted_by, revoked_at
```

Fonction RLS : `app.can_access_company(company_id)` = vrai si l'utilisateur courant est
`firm_admin` du cabinet de l'entreprise, OU affecté via `company_advisors`, OU membre via
`company_members`. Les permissions fines (publier, valider…) sont contrôlées dans les services.

## 2. Imports (couche RAW) — ✅ Phase 2

```
✅ import_files            company_id, kind ∈ {trial_balance, fec, bank_transactions},
                           status ∈ {uploaded, mapped, committed, superseded, cancelled},
                           original_name, mime_type, size_bytes, sha256, storage_key,
                           fiscal_year_id?, period_end?, data_status?, bank_account_id? (selon le type),
                           mapping jsonb, report jsonb, row_count, committed_at/by
                           unique(company_id, sha256) si committed/superseded  -- même fichier refusé
                           unique(company_id, fiscal_year_id) si FEC committed  -- un FEC courant par exercice

✅ import_rows             lignes en anomalie / exclues / doublons uniquement (D-17) :
                           import_file_id, company_id, row_number, raw jsonb, status, messages jsonb

✅ column_mapping_templates company_id, kind, header_signature, mapping jsonb
                           -- réappliqué automatiquement à un fichier de même en-tête
```

✅ storage_cleanup_queue (migration 0004) : fichiers à effacer du stockage après suppression d'un import
                           (company_id, storage_key, status pending/done/skipped, attempts, last_error)

Dédoublonnage bancaire : `natural_key_hash` = SHA-256(compte, date, montant, libellé normalisé,
référence, rang d'occurrence dans le fichier). Deux opérations identiques le même jour restent
distinctes ; un réimport (même en autre format, ex. CSV puis XLSX) n'enregistre que les nouvelles.

## 3. Comptabilité importée (NORMALIZED)

```
✅ fiscal_years            company_id, label, start_date, end_date,
                           status ∈ {open, closed_provisional, closed_final}
                           pas de chevauchement (trigger), durée < 24 mois

✅ chart_of_accounts       company_id, account_number, label, pcg_account, pcg_class,
                           is_auxiliary, mapping_status ∈ {auto_validated, to_review, manual}, mapping_rule_id
                           unique(company_id, account_number)

✅ trial_balances          company_id, fiscal_year_id, period_end date,
                           kind ∈ {monthly, cumulative, closing},
                           data_status ∈ {provisional, final},
                           source_import_id, supersedes_id?, is_current bool
                           -- une seule balance « courante » par (fiscal_year, period_end)

✅ trial_balance_lines     trial_balance_id, company_id, account_number,
                           opening_debit, opening_credit, period_debit, period_credit,
                           closing_debit, closing_credit   numeric(18,2)
                           check : Σ débits = Σ crédits (contrôlé au niveau balance)

✅ accounting_entries      (FEC / grand livre) company_id, fiscal_year_id, journal_code,
                           entry_number, entry_date, account_number, aux_account?,
                           piece_ref, piece_date, label, debit, credit,
                           lettering?, validation_date?, currency_amount?, currency?,
                           source_import_id
```

Si un FEC est importé, la balance est **dérivée** des écritures (pas saisie en double), et la
provenance l'indique.

## 4. Mapping et SIG

```
sig_rule_sets              firm_id, code (ex. « PCG-2025 »), label,
                           valid_from_fiscal_year_start date, valid_to?, status ∈ {draft, active}
                           -- versions du référentiel cabinet

sig_rubrics                rule_set_id, code (ex. VENTES_MARCHANDISES, ACHATS_MARCHANDISES,
                           VAR_STOCK_MARCH, PRODUCTION_VENDUE, …), label, display_order,
                           parent_code?, kind ∈ {line, subtotal}

sig_account_rules          rule_set_id, account_prefix varchar(20), rubric_code,
                           sign ∈ {+1, -1}, priority, comment
                           -- correspondance par préfixe le plus long

company_sig_overrides      company_id, rule_set_id, account_number|account_prefix,
                           rubric_code, reason text, approved_by, approved_at
                           -- retraitements / spécificités documentés par entreprise

sig_snapshots              company_id, fiscal_year_id, period_start, period_end,
                           rule_set_id, trial_balance_ids uuid[], data_version,
                           result jsonb (rubriques, comptes, montants),
                           checks jsonb, status ∈ {computed, validated, published},
                           validated_by?, published_at?
                           -- figé une fois validé
```

## 5. Trésorerie

```
✅ bank_accounts           company_id, bank_name, label, iban_masked (4 derniers caractères
                           en clair, IBAN complet chiffré si nécessaire), currency,
                           reference_balance numeric, reference_balance_date date

✅ bank_transactions       (0004 : flow_direction inflow/outflow/to_review, review_reason, category_code) company_id, bank_account_id, booking_date, value_date?,
                           amount numeric(18,2) (signé), currency, label_raw, label_normalized,
                           counterparty?, reference?, category_id?,
                           categorization_status ∈ {auto_validated, to_review, manual, blocked},
                           is_internal_transfer bool, source_import_id, natural_key_hash
                           unique(company_id, natural_key_hash)

cash_categories            company_id? (null = référentiel cabinet), code, label,
                           flow_type ∈ {operating, investing, financing, internal}
```

Solde à une date = `reference_balance` + Σ mouvements postérieurs (ou antérieurs, en négatif)
— calcul dans `domain/treasury`, testé ; écart avec un relevé ⇒ anomalie.

## 6. KPI

```
kpi_definitions            code, version, label, category, description, formula_text,
                           unit ∈ {eur, pct, days, ratio}, required_sources text[],
                           rounding, direction ∈ {higher_better, lower_better}
                           -- catalogue système versionné (docs/kpi-catalog.md)

company_kpi_settings       company_id, kpi_code, enabled, visible_to_client,
                           target numeric?, alert_low?, alert_high?, display_order

kpi_values                 company_id, kpi_code, kpi_version, period_start, period_end,
                           value numeric?, status ∈ {ok, insufficient_data, provisional},
                           inputs jsonb (traçabilité), data_version, computed_at
```

## 7. Reporting

```
report_templates           code (financial_overview, kpi, sig, treasury…), version, sections jsonb

reports                    company_id, template_code, kind ∈ {instant, validated},
                           title, period_start, period_end, comparison, options jsonb,
                           status ∈ {draft, in_review, validated, published, superseded}

report_versions            report_id, company_id, version_no, data_snapshot jsonb
                           (toutes les valeurs affichées, figées), data_version,
                           pdf_file_id, pdf_sha256, generated_by, generated_at,
                           published_by?, published_at?
                           -- immuable

report_downloads           report_version_id, company_id, user_id, at
```

Un rapport instantané n'est pas forcément conservé (configurable) ; un rapport validé l'est
toujours avec ses données figées.

## 8. Accompagnement (MVP minimal)

```
recommendations            company_id, title, context, risk, objective, related_kpi_code?,
                           status ∈ {draft, published, archived}, published_at

actions                    company_id, recommendation_id?, title, description,
                           owner_user_id?, owner_label?, priority ∈ {low, medium, high},
                           due_date?, status ∈ {todo, in_progress, waiting, done, cancelled},
                           client_can_update bool

comments                   company_id, target_type, target_id, body,
                           visibility ∈ {internal, client}  -- défaut : internal

internal_notes             company_id, body   -- table séparée : jamais jointe côté client

documents                  company_id, folder, name, storage_key, mime, size, sha256,
                           visibility ∈ {internal, client}, version_of?, uploaded_by

document_requests          company_id, title, description, due_date,
                           status ∈ {requested, submitted, accepted, rejected},
                           document_id?
```

## 9. Audit

```
✅ audit_log               id bigserial, at timestamptz, actor_user_id?, actor_kind
                           ∈ {user, job, system}, firm_id?, company_id?, action,
                           object_type, object_id, outcome ∈ {success, denied, failure},
                           details jsonb (jamais de secret, jamais de contenu de document),
                           request_id
                           -- append-only : révocation UPDATE/DELETE pour le rôle applicatif
```

## 10. Budgets (Phase 7 — modèle fixé dès maintenant, D-08)

```
budgets                    company_id, fiscal_year_id, name, scope ∈ {company, activity,
                           project, cost_center}, scope_ref?, currency
                           unique(company_id, fiscal_year_id, name)

budget_versions            budget_id, company_id, version_no, kind ∈ {initial, revised,
                           reforecast}, label, based_on_version_id?, status ∈ {draft,
                           validated, archived}, validated_by?, validated_at?,
                           cutoff_date? (reforecast : réalisé jusqu'à cette date)
                           -- une version validée est figée ; une révision crée une nouvelle version

budget_lines               budget_version_id, company_id, target_type ∈ {sig_rubric, account,
                           account_prefix, cash_category, custom}, target_ref,
                           period_month date (1er du mois) | null pour une ligne annuelle,
                           amount numeric(18,2), allocation_method ∈ {manual, flat, seasonal,
                           prior_year}, comment
                           -- annuel = somme des mois ; ligne annuelle non ventilée autorisée
                           -- (ventilation calculée et matérialisée à la validation)
```

Le réalisé est lu dans le moteur SIG (même rubriques, même référentiel versionné), ce qui garantit la
comparabilité budget / réalisé.

## 11. Entités des phases ultérieures (non détaillées)

Prévisions et scénarios, factures
clients/fournisseurs, paiements et affectations, rapprochements bancaires, tiers (clients,
fournisseurs), centres de coûts et axes analytiques, règles d'automatisation et exécutions,
alertes, missions/modèles/tâches, rendez-vous, business plans, simulations d'emprunt.
Elles respecteront les mêmes conventions (company_id, numeric, provenance, audit).
