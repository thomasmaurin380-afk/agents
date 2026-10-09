-- Phase 2 — Imports, comptabilité importée, banque : intégrité inter-entreprises, privilèges, RLS.
-- Lecture : couche RAW (fichiers, lignes en anomalie, modèles, règles) réservée au personnel du
-- cabinet ; données normalisées lisibles par toute personne ayant accès à l'entreprise (les écrans
-- clients n'exposent que des restitutions, la matrice applicative filtrant le reste).
-- Écriture : personnel du cabinet ayant accès à l'entreprise.

-- ───────────── Intégrité : un enfant appartient toujours à la même entreprise que son parent ─────────────
ALTER TABLE app.fiscal_years ADD CONSTRAINT fiscal_years_id_company_key UNIQUE (id, company_id);
--> statement-breakpoint
ALTER TABLE app.import_files ADD CONSTRAINT import_files_id_company_key UNIQUE (id, company_id);
--> statement-breakpoint
ALTER TABLE app.trial_balances ADD CONSTRAINT trial_balances_id_company_key UNIQUE (id, company_id);
--> statement-breakpoint
ALTER TABLE app.bank_accounts ADD CONSTRAINT bank_accounts_id_company_key UNIQUE (id, company_id);
--> statement-breakpoint
ALTER TABLE app.import_files ADD CONSTRAINT import_files_fiscal_year_fk
  FOREIGN KEY (fiscal_year_id, company_id) REFERENCES app.fiscal_years (id, company_id);
--> statement-breakpoint
ALTER TABLE app.import_files ADD CONSTRAINT import_files_bank_account_fk
  FOREIGN KEY (bank_account_id, company_id) REFERENCES app.bank_accounts (id, company_id);
--> statement-breakpoint
ALTER TABLE app.import_files ADD CONSTRAINT import_files_params CHECK (
  (kind = 'trial_balance' AND fiscal_year_id IS NOT NULL AND period_end IS NOT NULL AND data_status IN ('provisional', 'final'))
  OR (kind = 'fec' AND fiscal_year_id IS NOT NULL)
  OR (kind = 'bank_transactions' AND bank_account_id IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE app.import_rows ADD CONSTRAINT import_rows_file_company_fk
  FOREIGN KEY (import_file_id, company_id) REFERENCES app.import_files (id, company_id);
--> statement-breakpoint
ALTER TABLE app.trial_balances ADD CONSTRAINT trial_balances_fiscal_year_company_fk
  FOREIGN KEY (fiscal_year_id, company_id) REFERENCES app.fiscal_years (id, company_id);
--> statement-breakpoint
ALTER TABLE app.trial_balances ADD CONSTRAINT trial_balances_import_company_fk
  FOREIGN KEY (source_import_id, company_id) REFERENCES app.import_files (id, company_id);
--> statement-breakpoint
ALTER TABLE app.trial_balances ADD CONSTRAINT trial_balances_supersedes_fk
  FOREIGN KEY (supersedes_id, company_id) REFERENCES app.trial_balances (id, company_id);
--> statement-breakpoint
ALTER TABLE app.trial_balance_lines ADD CONSTRAINT trial_balance_lines_balance_company_fk
  FOREIGN KEY (trial_balance_id, company_id) REFERENCES app.trial_balances (id, company_id);
--> statement-breakpoint
ALTER TABLE app.accounting_entries ADD CONSTRAINT accounting_entries_fiscal_year_company_fk
  FOREIGN KEY (fiscal_year_id, company_id) REFERENCES app.fiscal_years (id, company_id);
--> statement-breakpoint
ALTER TABLE app.accounting_entries ADD CONSTRAINT accounting_entries_import_company_fk
  FOREIGN KEY (import_file_id, company_id) REFERENCES app.import_files (id, company_id);
--> statement-breakpoint
ALTER TABLE app.accounting_entries ADD CONSTRAINT accounting_entries_one_side
  CHECK (NOT (debit <> 0 AND credit <> 0));
--> statement-breakpoint
ALTER TABLE app.bank_transactions ADD CONSTRAINT bank_transactions_account_company_fk
  FOREIGN KEY (bank_account_id, company_id) REFERENCES app.bank_accounts (id, company_id);
--> statement-breakpoint
ALTER TABLE app.bank_transactions ADD CONSTRAINT bank_transactions_import_company_fk
  FOREIGN KEY (source_import_id, company_id) REFERENCES app.import_files (id, company_id);
--> statement-breakpoint
ALTER TABLE app.chart_of_accounts ADD CONSTRAINT chart_of_accounts_import_company_fk
  FOREIGN KEY (first_seen_import_id, company_id) REFERENCES app.import_files (id, company_id);
--> statement-breakpoint

-- ───────────── Exercices : pas de chevauchement (trigger portable, sans extension) ─────────────
CREATE FUNCTION app.check_fiscal_year_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Sérialise les créations concurrentes pour une même entreprise.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_years:' || NEW.company_id::text));
  IF EXISTS (
    SELECT 1 FROM app.fiscal_years f
    WHERE f.company_id = NEW.company_id AND f.id <> NEW.id
      AND f.start_date <= NEW.end_date AND NEW.start_date <= f.end_date
  ) THEN
    RAISE EXCEPTION 'fiscal_year_overlap' USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER fiscal_years_no_overlap
  BEFORE INSERT OR UPDATE OF start_date, end_date ON app.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION app.check_fiscal_year_overlap();
--> statement-breakpoint

-- ───────────── Version des données (invalidation des calculs) ─────────────
-- Le collaborateur DAF n'a pas le droit de modifier la fiche entreprise : incrément via fonction contrôlée.
CREATE FUNCTION app.bump_data_version(p_company uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v bigint;
BEGIN
  IF NOT app.is_company_staff(p_company) THEN
    RAISE EXCEPTION 'bump_data_version: accès refusé' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE app.companies SET data_version = data_version + 1, updated_at = now()
  WHERE id = p_company RETURNING data_version INTO v;
  RETURN v;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.check_fiscal_year_overlap() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.bump_data_version(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.bump_data_version(uuid) TO app_runtime;
--> statement-breakpoint

-- ───────────── Privilèges (explicites, minimaux) ─────────────
GRANT SELECT, INSERT ON app.fiscal_years TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (label, status) ON app.fiscal_years TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.import_files TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (status, mapping, report, row_count, committed_at, committed_by) ON app.import_files TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.import_rows TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE app.import_rows_id_seq TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON app.column_mapping_templates TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (mapping, updated_at, created_by) ON app.column_mapping_templates TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.chart_of_accounts TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (label, pcg_account, pcg_class, is_auxiliary, mapping_status, mapping_rule_id, updated_at, updated_by)
  ON app.chart_of_accounts TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON app.account_mapping_rules TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (pcg_account) ON app.account_mapping_rules TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.trial_balances TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (is_current) ON app.trial_balances TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.trial_balance_lines TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE app.trial_balance_lines_id_seq TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.accounting_entries TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE app.accounting_entries_id_seq TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.bank_accounts TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (bank_name, label, iban_last4, archived_at) ON app.bank_accounts TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.bank_transactions TO app_runtime;
--> statement-breakpoint

-- ───────────── Ensembles d'entreprises accessibles (performance) ─────────────
-- Utilisées sous la forme « company_id IN (SELECT …) » : la sous-requête non corrélée est évaluée
-- une seule fois par instruction (et non pour chaque ligne), indispensable pour les imports
-- volumineux (100 000 lignes). Sémantique identique à is_company_staff / can_access_company.
CREATE FUNCTION app.staff_company_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id
  FROM app.companies c
  JOIN app.firm_members fm ON fm.firm_id = c.firm_id AND fm.user_id = app.active_user_id()
  WHERE fm.role = 'firm_admin'
     OR EXISTS (SELECT 1 FROM app.company_advisors ca WHERE ca.company_id = c.id AND ca.user_id = fm.user_id)
$$;
--> statement-breakpoint
CREATE FUNCTION app.accessible_company_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.staff_company_ids()
  UNION
  SELECT cm.company_id
  FROM app.company_members cm
  JOIN app.companies c ON c.id = cm.company_id
  WHERE cm.user_id = app.active_user_id() AND c.status <> 'archived'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.staff_company_ids() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.accessible_company_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.staff_company_ids() TO app_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.accessible_company_ids() TO app_runtime;
--> statement-breakpoint

-- ───────────── RLS ─────────────
ALTER TABLE app.fiscal_years ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.import_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.import_rows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.column_mapping_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.chart_of_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.account_mapping_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.trial_balances ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.trial_balance_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.accounting_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.bank_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.bank_transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Couche RAW : personnel du cabinet uniquement.
CREATE POLICY import_files_staff ON app.import_files FOR ALL TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY import_rows_staff ON app.import_rows FOR ALL TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY column_mapping_templates_staff ON app.column_mapping_templates FOR ALL TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY account_mapping_rules_staff ON app.account_mapping_rules FOR ALL TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint

-- Données normalisées : lecture par l'entreprise, écriture par le personnel du cabinet.
CREATE POLICY fiscal_years_select ON app.fiscal_years FOR SELECT TO app_runtime USING (company_id IN (SELECT app.accessible_company_ids()));
--> statement-breakpoint
CREATE POLICY fiscal_years_write ON app.fiscal_years FOR INSERT TO app_runtime WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY fiscal_years_update ON app.fiscal_years FOR UPDATE TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY chart_of_accounts_select ON app.chart_of_accounts FOR SELECT TO app_runtime USING (company_id IN (SELECT app.accessible_company_ids()));
--> statement-breakpoint
CREATE POLICY chart_of_accounts_insert ON app.chart_of_accounts FOR INSERT TO app_runtime WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY chart_of_accounts_update ON app.chart_of_accounts FOR UPDATE TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY trial_balances_select ON app.trial_balances FOR SELECT TO app_runtime USING (company_id IN (SELECT app.accessible_company_ids()));
--> statement-breakpoint
CREATE POLICY trial_balances_insert ON app.trial_balances FOR INSERT TO app_runtime WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY trial_balances_update ON app.trial_balances FOR UPDATE TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY trial_balance_lines_select ON app.trial_balance_lines FOR SELECT TO app_runtime USING (company_id IN (SELECT app.accessible_company_ids()));
--> statement-breakpoint
CREATE POLICY trial_balance_lines_insert ON app.trial_balance_lines FOR INSERT TO app_runtime WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY accounting_entries_select ON app.accounting_entries FOR SELECT TO app_runtime USING (company_id IN (SELECT app.accessible_company_ids()));
--> statement-breakpoint
CREATE POLICY accounting_entries_insert ON app.accounting_entries FOR INSERT TO app_runtime WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY bank_accounts_select ON app.bank_accounts FOR SELECT TO app_runtime USING (company_id IN (SELECT app.accessible_company_ids()));
--> statement-breakpoint
CREATE POLICY bank_accounts_insert ON app.bank_accounts FOR INSERT TO app_runtime WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY bank_accounts_update ON app.bank_accounts FOR UPDATE TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids())) WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY bank_transactions_select ON app.bank_transactions FOR SELECT TO app_runtime USING (company_id IN (SELECT app.accessible_company_ids()));
--> statement-breakpoint
CREATE POLICY bank_transactions_insert ON app.bank_transactions FOR INSERT TO app_runtime WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
