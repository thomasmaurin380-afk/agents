-- Phase 3 — SIG : intégrité, immutabilité, privilèges, RLS, empreinte des données (écrit à la main).
-- Les règles communes (référentiels PCG-2024 / PCG-2025) sont versionnées dans le code
-- (domain/sig/rules.ts) ; seules les exceptions d'entreprise, les validations du cabinet et les
-- versions figées sont en base.

-- ───────────── Intégrité inter-entreprises ─────────────
ALTER TABLE app.sig_snapshots ADD CONSTRAINT sig_snapshots_fiscal_year_company_fk
  FOREIGN KEY (fiscal_year_id, company_id) REFERENCES app.fiscal_years (id, company_id);
--> statement-breakpoint

-- ───────────── Exceptions : jamais modifiées ni supprimées, seulement remplacées ─────────────
CREATE FUNCTION app.sig_override_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sig_override_immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.replaced_at IS NOT NULL OR NEW.replaced_at IS NULL
     OR (to_jsonb(NEW) - 'replaced_at' - 'replaced_by') <> (to_jsonb(OLD) - 'replaced_at' - 'replaced_by') THEN
    RAISE EXCEPTION 'sig_override_immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER sig_account_overrides_guard BEFORE UPDATE OR DELETE ON app.sig_account_overrides
  FOR EACH ROW EXECUTE FUNCTION app.sig_override_guard();
--> statement-breakpoint

-- ───────────── Versions figées : seul « validé → publié » est permis ─────────────
CREATE FUNCTION app.sig_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sig_snapshot_immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'validated' OR NEW.status <> 'published'
     OR (to_jsonb(NEW) - 'status' - 'published_by' - 'published_at') <> (to_jsonb(OLD) - 'status' - 'published_by' - 'published_at') THEN
    RAISE EXCEPTION 'sig_snapshot_immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Publication : le référentiel utilisé doit avoir été validé par le cabinet.
  IF NOT EXISTS (
    SELECT 1 FROM app.sig_rule_set_approvals a
    JOIN app.companies c ON c.firm_id = a.firm_id
    WHERE c.id = NEW.company_id AND a.rule_set_code = NEW.rule_set_code AND a.rules_hash = NEW.rules_hash
  ) THEN
    RAISE EXCEPTION 'sig_rule_set_not_approved' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER sig_snapshots_guard BEFORE UPDATE OR DELETE ON app.sig_snapshots
  FOR EACH ROW EXECUTE FUNCTION app.sig_snapshot_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.sig_override_guard() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.sig_snapshot_guard() FROM PUBLIC;
--> statement-breakpoint

-- ───────────── Empreinte des données d'un exercice (obsolescence des versions figées) ─────────────
-- Balance(s) courante(s), FEC courant, rattachements PCG du plan de comptes et exceptions SIG actives.
-- SECURITY DEFINER : un client doit pouvoir savoir qu'une version publiée est obsolète sans lire
-- les exceptions internes. Ne renvoie qu'un condensé.
CREATE FUNCTION app.sig_data_fingerprint(p_company uuid, p_fiscal_year uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v text;
BEGIN
  IF NOT app.can_access_company(p_company) THEN
    RAISE EXCEPTION 'sig_fingerprint_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT concat_ws('|',
    (SELECT string_agg(tb.id::text || '@' || tb.period_end::text, ',' ORDER BY tb.period_end, tb.id)
       FROM app.trial_balances tb
      WHERE tb.company_id = p_company AND tb.fiscal_year_id = p_fiscal_year AND tb.is_current),
    (SELECT string_agg(f.id::text, ',' ORDER BY f.id)
       FROM app.import_files f
      WHERE f.company_id = p_company AND f.fiscal_year_id = p_fiscal_year AND f.kind = 'fec' AND f.status = 'committed'),
    (SELECT string_agg(ca.account_number || '=' || coalesce(ca.pcg_account, '?'), ',' ORDER BY ca.account_number)
       FROM app.chart_of_accounts ca
      WHERE ca.company_id = p_company AND (ca.pcg_class IN (6, 7) OR ca.account_number ~ '^[67]')),
    (SELECT string_agg(o.rule_set_code || ':' || o.account_number || '=' || o.line || '#' || o.id::text, ',' ORDER BY o.rule_set_code, o.account_number)
       FROM app.sig_account_overrides o
      WHERE o.company_id = p_company AND o.replaced_at IS NULL)
  ) INTO v;
  RETURN encode(sha256(convert_to(coalesce(v, ''), 'UTF8')), 'hex');
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.sig_data_fingerprint(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.sig_data_fingerprint(uuid, uuid) TO app_runtime;
--> statement-breakpoint

-- ───────────── Privilèges ─────────────
GRANT SELECT, INSERT ON app.sig_account_overrides TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (replaced_at, replaced_by) ON app.sig_account_overrides TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.sig_rule_set_approvals TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.sig_snapshots TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (status, published_by, published_at) ON app.sig_snapshots TO app_runtime;
--> statement-breakpoint

-- ───────────── RLS ─────────────
ALTER TABLE app.sig_account_overrides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.sig_rule_set_approvals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.sig_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Exceptions : internes au cabinet ; création et remplacement par l'administrateur du cabinet.
CREATE POLICY sig_account_overrides_select ON app.sig_account_overrides FOR SELECT TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint
CREATE POLICY sig_account_overrides_insert ON app.sig_account_overrides FOR INSERT TO app_runtime
  WITH CHECK (app.is_company_admin(company_id) AND created_by = app.current_user_id());
--> statement-breakpoint
CREATE POLICY sig_account_overrides_update ON app.sig_account_overrides FOR UPDATE TO app_runtime
  USING (app.is_company_admin(company_id))
  WITH CHECK (app.is_company_admin(company_id) AND replaced_by = app.current_user_id());
--> statement-breakpoint
-- Validation des référentiels : visible du cabinet, accordée par son administrateur.
CREATE POLICY sig_rule_set_approvals_select ON app.sig_rule_set_approvals FOR SELECT TO app_runtime
  USING (app.is_firm_member(firm_id));
--> statement-breakpoint
CREATE POLICY sig_rule_set_approvals_insert ON app.sig_rule_set_approvals FOR INSERT TO app_runtime
  WITH CHECK (app.is_firm_admin(firm_id) AND approved_by = app.current_user_id());
--> statement-breakpoint
-- Versions figées : tout le personnel de l'entreprise ; les clients ne voient QUE les versions publiées.
CREATE POLICY sig_snapshots_select ON app.sig_snapshots FOR SELECT TO app_runtime
  USING (
    company_id IN (SELECT app.staff_company_ids())
    OR (status = 'published' AND company_id IN (SELECT app.accessible_company_ids()))
  );
--> statement-breakpoint
CREATE POLICY sig_snapshots_insert ON app.sig_snapshots FOR INSERT TO app_runtime
  WITH CHECK (
    company_id IN (SELECT app.staff_company_ids())
    AND status = 'validated' AND published_at IS NULL AND validated_by = app.current_user_id()
  );
--> statement-breakpoint
CREATE POLICY sig_snapshots_publish ON app.sig_snapshots FOR UPDATE TO app_runtime
  USING (app.is_company_admin(company_id))
  WITH CHECK (app.is_company_admin(company_id) AND published_by = app.current_user_id());
