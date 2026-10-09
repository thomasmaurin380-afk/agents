-- Phase 1 — Isolation multi-tenant : rôle d'exécution, fonctions d'accès, politiques RLS,
-- journal d'audit append-only, invitations. Voir docs/architecture.md § 5 et docs/permissions.md.
--
-- Principe : l'application se connecte avec le rôle propriétaire (qui contourne la RLS, y compris
-- `postgres` sur Supabase qui possède BYPASSRLS), puis chaque transaction exécute
-- `SET LOCAL ROLE app_runtime` et `set_config('app.user_id', <uuid>, true)`.
-- Toutes les requêtes métier sont donc soumises aux politiques ci-dessous.
-- Les fonctions SECURITY DEFINER appartiennent au propriétaire et lisent les tables d'appartenance
-- sans récursion RLS ; elles fixent search_path = '' et qualifient tous les objets.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
GRANT app_runtime TO CURRENT_USER;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_runtime;
--> statement-breakpoint

-- ───────────────────────────── Fonctions d'identité et d'accès ─────────────────────────────

CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE FUNCTION app.active_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id FROM app.users u
  WHERE u.id = app.current_user_id() AND u.disabled_at IS NULL
$$;
--> statement-breakpoint
CREATE FUNCTION app.is_firm_member(p_firm uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.firm_members fm
    WHERE fm.firm_id = p_firm AND fm.user_id = app.active_user_id()
  )
$$;
--> statement-breakpoint
CREATE FUNCTION app.is_firm_admin(p_firm uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.firm_members fm
    WHERE fm.firm_id = p_firm AND fm.user_id = app.active_user_id() AND fm.role = 'firm_admin'
  )
$$;
--> statement-breakpoint
-- Personnel du cabinet ayant accès à l'entreprise : administrateur du cabinet, ou collaborateur affecté.
CREATE FUNCTION app.is_company_staff(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.companies c
    JOIN app.firm_members fm ON fm.firm_id = c.firm_id AND fm.user_id = app.active_user_id()
    WHERE c.id = p_company
      AND (
        fm.role = 'firm_admin'
        OR EXISTS (
          SELECT 1 FROM app.company_advisors ca
          WHERE ca.company_id = c.id AND ca.user_id = fm.user_id
        )
      )
  )
$$;
--> statement-breakpoint
CREATE FUNCTION app.is_company_admin(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.companies c
    JOIN app.firm_members fm ON fm.firm_id = c.firm_id
    WHERE c.id = p_company AND fm.user_id = app.active_user_id() AND fm.role = 'firm_admin'
  )
$$;
--> statement-breakpoint
-- Utilisateur client d'une entreprise non archivée.
CREATE FUNCTION app.is_company_client(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.company_members cm
    JOIN app.companies c ON c.id = cm.company_id
    WHERE cm.company_id = p_company
      AND cm.user_id = app.active_user_id()
      AND c.status <> 'archived'
  )
$$;
--> statement-breakpoint
CREATE FUNCTION app.can_access_company(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.is_company_staff(p_company) OR app.is_company_client(p_company)
$$;
--> statement-breakpoint
CREATE FUNCTION app.is_client_of_firm(p_firm uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.company_members cm
    JOIN app.companies c ON c.id = cm.company_id
    WHERE c.firm_id = p_firm AND cm.user_id = app.active_user_id() AND c.status <> 'archived'
  )
$$;
--> statement-breakpoint
CREATE FUNCTION app.user_is_firm_member(p_user uuid, p_firm uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.firm_members fm WHERE fm.user_id = p_user AND fm.firm_id = p_firm
  )
$$;
--> statement-breakpoint
CREATE FUNCTION app.company_firm_id(p_company uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.firm_id FROM app.companies c WHERE c.id = p_company
$$;
--> statement-breakpoint
-- Visibilité des profils : soi-même ; collègues du cabinet ; clients des entreprises suivies ;
-- pour un client, les conseillers (référent ou affectés) de ses entreprises.
CREATE FUNCTION app.can_see_user(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_user = app.active_user_id()
    OR EXISTS (
      SELECT 1 FROM app.firm_members me
      JOIN app.firm_members them ON them.firm_id = me.firm_id
      WHERE me.user_id = app.active_user_id() AND them.user_id = p_user
    )
    OR EXISTS (
      SELECT 1 FROM app.company_members cm
      WHERE cm.user_id = p_user AND app.is_company_staff(cm.company_id)
    )
    OR EXISTS (
      SELECT 1 FROM app.companies c
      WHERE c.lead_advisor_id = p_user AND app.is_company_client(c.id)
    )
    OR EXISTS (
      SELECT 1 FROM app.company_advisors ca
      WHERE ca.user_id = p_user AND app.is_company_client(ca.company_id)
    )
$$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_runtime;
--> statement-breakpoint

-- ───────────────────────────── Privilèges sur les tables ─────────────────────────────
-- Accordés explicitement table par table (aucun privilège par défaut).

GRANT SELECT ON app.firms TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (name, siren) ON app.firms TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON app.users TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (full_name) ON app.users TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON app.firm_members TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (role) ON app.firm_members TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.companies TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (legal_name, trade_name, siren, legal_form, naf_code, sector, fiscal_year_start_month,
              status, enabled_modules, lead_advisor_id, data_version, updated_at)
  ON app.companies TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON app.company_members TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (role) ON app.company_members TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON app.company_advisors TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.invitations TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (revoked_at) ON app.invitations TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON app.audit_log TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE app.audit_log_id_seq TO app_runtime;
--> statement-breakpoint

-- ───────────────────────────── Politiques RLS ─────────────────────────────

ALTER TABLE app.firms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.firm_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.company_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.company_advisors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY firms_select ON app.firms FOR SELECT TO app_runtime
  USING (app.is_firm_member(id) OR app.is_client_of_firm(id));
--> statement-breakpoint
CREATE POLICY firms_update ON app.firms FOR UPDATE TO app_runtime
  USING (app.is_firm_admin(id)) WITH CHECK (app.is_firm_admin(id));
--> statement-breakpoint

CREATE POLICY users_select ON app.users FOR SELECT TO app_runtime
  USING (app.can_see_user(id));
--> statement-breakpoint
CREATE POLICY users_update_self ON app.users FOR UPDATE TO app_runtime
  USING (id = app.active_user_id()) WITH CHECK (id = app.active_user_id());
--> statement-breakpoint

CREATE POLICY firm_members_select ON app.firm_members FOR SELECT TO app_runtime
  USING (user_id = app.active_user_id() OR app.is_firm_member(firm_id));
--> statement-breakpoint
CREATE POLICY firm_members_insert ON app.firm_members FOR INSERT TO app_runtime
  WITH CHECK (app.is_firm_admin(firm_id));
--> statement-breakpoint
CREATE POLICY firm_members_update ON app.firm_members FOR UPDATE TO app_runtime
  USING (app.is_firm_admin(firm_id)) WITH CHECK (app.is_firm_admin(firm_id));
--> statement-breakpoint
CREATE POLICY firm_members_delete ON app.firm_members FOR DELETE TO app_runtime
  USING (app.is_firm_admin(firm_id));
--> statement-breakpoint

CREATE POLICY companies_select ON app.companies FOR SELECT TO app_runtime
  USING (app.can_access_company(id));
--> statement-breakpoint
CREATE POLICY companies_insert ON app.companies FOR INSERT TO app_runtime
  WITH CHECK (
    app.is_firm_admin(firm_id)
    AND (lead_advisor_id IS NULL OR app.user_is_firm_member(lead_advisor_id, firm_id))
  );
--> statement-breakpoint
CREATE POLICY companies_update ON app.companies FOR UPDATE TO app_runtime
  USING (app.is_company_admin(id))
  WITH CHECK (
    app.is_firm_admin(firm_id)
    AND (lead_advisor_id IS NULL OR app.user_is_firm_member(lead_advisor_id, firm_id))
  );
--> statement-breakpoint

CREATE POLICY company_members_select ON app.company_members FOR SELECT TO app_runtime
  USING (user_id = app.active_user_id() OR app.is_company_staff(company_id));
--> statement-breakpoint
CREATE POLICY company_members_insert ON app.company_members FOR INSERT TO app_runtime
  WITH CHECK (app.is_company_admin(company_id));
--> statement-breakpoint
CREATE POLICY company_members_update ON app.company_members FOR UPDATE TO app_runtime
  USING (app.is_company_admin(company_id)) WITH CHECK (app.is_company_admin(company_id));
--> statement-breakpoint
CREATE POLICY company_members_delete ON app.company_members FOR DELETE TO app_runtime
  USING (app.is_company_admin(company_id));
--> statement-breakpoint

CREATE POLICY company_advisors_select ON app.company_advisors FOR SELECT TO app_runtime
  USING (user_id = app.active_user_id() OR app.is_company_staff(company_id));
--> statement-breakpoint
CREATE POLICY company_advisors_insert ON app.company_advisors FOR INSERT TO app_runtime
  WITH CHECK (
    app.is_company_admin(company_id)
    AND app.user_is_firm_member(user_id, app.company_firm_id(company_id))
  );
--> statement-breakpoint
CREATE POLICY company_advisors_delete ON app.company_advisors FOR DELETE TO app_runtime
  USING (app.is_company_admin(company_id));
--> statement-breakpoint

CREATE POLICY invitations_select ON app.invitations FOR SELECT TO app_runtime
  USING (app.is_firm_admin(firm_id));
--> statement-breakpoint
CREATE POLICY invitations_insert ON app.invitations FOR INSERT TO app_runtime
  WITH CHECK (
    app.is_firm_admin(firm_id)
    AND created_by = app.active_user_id()
    AND (company_id IS NULL OR app.company_firm_id(company_id) = firm_id)
  );
--> statement-breakpoint
CREATE POLICY invitations_update ON app.invitations FOR UPDATE TO app_runtime
  USING (app.is_firm_admin(firm_id)) WITH CHECK (app.is_firm_admin(firm_id));
--> statement-breakpoint

-- Toute action (y compris un refus d'accès) peut être journalisée par l'utilisateur courant,
-- sans pouvoir usurper un autre acteur. Lecture réservée au cabinet.
CREATE POLICY audit_log_insert ON app.audit_log FOR INSERT TO app_runtime
  WITH CHECK (
    (actor_kind = 'user' AND actor_user_id = app.current_user_id())
    OR (actor_kind <> 'user' AND actor_user_id IS NULL)
  );
--> statement-breakpoint
CREATE POLICY audit_log_select ON app.audit_log FOR SELECT TO app_runtime
  USING (
    (firm_id IS NOT NULL AND app.is_firm_admin(firm_id))
    OR (company_id IS NOT NULL AND app.is_company_staff(company_id))
  );
--> statement-breakpoint

-- ───────────────────────────── Journal d'audit append-only ─────────────────────────────

CREATE FUNCTION app.forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est en ajout seul (% interdit)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.forbid_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON app.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_audit_mutation();
--> statement-breakpoint

-- ───────────────────────────── Invitations ─────────────────────────────

-- Aperçu d'une invitation à partir du hash du jeton (page publique d'acceptation).
CREATE FUNCTION app.invitation_preview(p_token_hash text)
RETURNS TABLE (email text, role app.invitation_role, company_name text, firm_name text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.email, i.role, coalesce(c.trade_name, c.legal_name), f.name,
    CASE
      WHEN i.revoked_at IS NOT NULL THEN 'revoked'
      WHEN i.accepted_at IS NOT NULL THEN 'accepted'
      WHEN i.expires_at <= now() THEN 'expired'
      ELSE 'valid'
    END
  FROM app.invitations i
  JOIN app.firms f ON f.id = i.firm_id
  LEFT JOIN app.companies c ON c.id = i.company_id
  WHERE i.token_hash = p_token_hash
$$;
--> statement-breakpoint
-- Acceptation atomique : contrôle du jeton, création du profil, rattachement, consommation.
-- p_user_id doit être l'utilisateur courant (fixé par l'application après authentification
-- ou création du compte) : une invitation ne peut rattacher qu'à soi-même.
CREATE FUNCTION app.accept_invitation(p_token_hash text, p_user_id uuid, p_email text, p_full_name text)
RETURNS TABLE (invitation_id uuid, role app.invitation_role, firm_id uuid, company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  inv app.invitations%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'invitation_user_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO inv FROM app.invitations i WHERE i.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF inv.revoked_at IS NOT NULL OR inv.accepted_at IS NOT NULL OR inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invitation_not_valid' USING ERRCODE = 'check_violation';
  END IF;
  IF lower(p_email) <> inv.email THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO app.users (id, email, full_name)
  VALUES (p_user_id, lower(p_email), p_full_name)
  ON CONFLICT (id) DO NOTHING;

  IF inv.role IN ('firm_admin', 'firm_analyst') THEN
    INSERT INTO app.firm_members (firm_id, user_id, role)
    VALUES (inv.firm_id, p_user_id, inv.role::text::app.firm_role)
    ON CONFLICT (firm_id, user_id) DO UPDATE SET role = excluded.role;
  ELSE
    INSERT INTO app.company_members (company_id, user_id, role)
    VALUES (inv.company_id, p_user_id, inv.role::text::app.client_role)
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = excluded.role;
  END IF;

  UPDATE app.invitations SET accepted_at = now(), accepted_by = p_user_id WHERE id = inv.id;

  INSERT INTO app.audit_log (actor_user_id, actor_kind, firm_id, company_id, action,
                             object_type, object_id, outcome, details)
  VALUES (p_user_id, 'user', inv.firm_id, inv.company_id, 'invitation.accept',
          'invitation', inv.id::text, 'success', jsonb_build_object('role', inv.role));

  RETURN QUERY SELECT inv.id, inv.role, inv.firm_id, inv.company_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.invitation_preview(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.accept_invitation(text, uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.invitation_preview(text) TO app_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.accept_invitation(text, uuid, text, text) TO app_runtime;
