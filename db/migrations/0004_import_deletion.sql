CREATE TABLE "app"."storage_cleanup_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"import_file_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_cleanup_queue_status" CHECK ("app"."storage_cleanup_queue"."status" in ('pending', 'done', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "app"."bank_transactions" ADD COLUMN "flow_direction" text DEFAULT 'to_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."bank_transactions" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "app"."bank_transactions" ADD COLUMN "category_code" text;--> statement-breakpoint
ALTER TABLE "app"."storage_cleanup_queue" ADD CONSTRAINT "storage_cleanup_queue_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "app"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_cleanup_queue_pending_idx" ON "app"."storage_cleanup_queue" USING btree ("company_id","status");--> statement-breakpoint
ALTER TABLE "app"."bank_transactions" ADD CONSTRAINT "bank_transactions_flow_direction" CHECK ("app"."bank_transactions"."flow_direction" in ('inflow', 'outflow', 'to_review'));--> statement-breakpoint

-- ═════════════ Suppression sécurisée d'un import (écrit à la main) ═════════════
-- Les données importées restent non modifiables par le rôle applicatif (aucun DELETE accordé sur
-- les tables financières). La seule voie de suppression est app.delete_import : SECURITY DEFINER,
-- réservée à l'administrateur du cabinet de l'entreprise, ciblée par (company_id, import_id),
-- atomique (une fonction = une transaction), journalisée.

-- Sens des opérations déjà importées, déduit du montant (aucune catégorie n'est inventée).
UPDATE app.bank_transactions
SET flow_direction = CASE WHEN amount > 0 THEN 'inflow' WHEN amount < 0 THEN 'outflow' ELSE 'to_review' END,
    review_reason = CASE WHEN amount = 0 THEN 'Montant nul' ELSE NULL END;
--> statement-breakpoint

-- File de nettoyage du stockage : lecture et suivi par le personnel du cabinet.
ALTER TABLE app.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON app.storage_cleanup_queue TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (status, attempts, last_error, updated_at) ON app.storage_cleanup_queue TO app_runtime;
--> statement-breakpoint
CREATE POLICY storage_cleanup_queue_staff ON app.storage_cleanup_queue FOR ALL TO app_runtime
  USING (company_id IN (SELECT app.staff_company_ids()))
  WITH CHECK (company_id IN (SELECT app.staff_company_ids()));
--> statement-breakpoint

-- ───────────── Plan de suppression (lecture seule) ─────────────
-- Volumes, effets sur le plan de comptes et l'historique des versions, sources restantes,
-- partage du fichier stocké, et motifs de blocage. Utilisé pour la confirmation et par delete_import.
CREATE FUNCTION app.import_deletion_plan(p_company uuid, p_import uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  f app.import_files%ROWTYPE;
  tb app.trial_balances%ROWTYPE;
  v_blockers jsonb := '[]'::jsonb;
  v_tb_count int := 0;
  v_tb_lines int := 0;
  v_entries int := 0;
  v_bank int := 0;
  v_rows int := 0;
  v_acc_reassign int := 0;
  v_acc_keep int := 0;
  v_acc_delete int := 0;
  v_shared int := 0;
  v_previous jsonb := NULL;
  v_newer jsonb := NULL;
  v_is_current boolean := false;
  v_dup_imports text;
BEGIN
  IF NOT app.is_company_staff(p_company) THEN
    RAISE EXCEPTION 'import_deletion_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO f FROM app.import_files i WHERE i.id = p_import AND i.company_id = p_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'import_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF f.status NOT IN ('committed', 'superseded') THEN
    v_blockers := v_blockers || to_jsonb('Cet import n''a rien enregistré : utilisez « Annuler l''import ».'::text);
  END IF;

  SELECT count(*) INTO v_rows FROM app.import_rows r WHERE r.import_file_id = p_import AND r.company_id = p_company;
  SELECT count(*) INTO v_shared FROM app.import_files o
    WHERE o.company_id = p_company AND o.storage_key = f.storage_key AND o.id <> p_import;

  IF f.kind = 'trial_balance' THEN
    SELECT * INTO tb FROM app.trial_balances b WHERE b.source_import_id = p_import AND b.company_id = p_company;
    IF FOUND THEN
      v_tb_count := 1;
      v_is_current := tb.is_current;
      SELECT count(*) INTO v_tb_lines FROM app.trial_balance_lines l WHERE l.trial_balance_id = tb.id AND l.company_id = p_company;
      SELECT jsonb_build_object('importId', p.source_import_id, 'fileName', i.original_name, 'isCurrent', p.is_current)
        INTO v_previous
        FROM app.trial_balances p JOIN app.import_files i ON i.id = p.source_import_id
        WHERE p.id = tb.supersedes_id AND p.company_id = p_company;
      SELECT jsonb_build_object('importId', n.source_import_id, 'fileName', i.original_name, 'isCurrent', n.is_current)
        INTO v_newer
        FROM app.trial_balances n JOIN app.import_files i ON i.id = n.source_import_id
        WHERE n.supersedes_id = tb.id AND n.company_id = p_company;
    END IF;
  ELSIF f.kind = 'fec' THEN
    SELECT count(*) INTO v_entries FROM app.accounting_entries e WHERE e.import_file_id = p_import AND e.company_id = p_company;
    v_is_current := f.status = 'committed';
    SELECT jsonb_build_object('importId', i.id, 'fileName', i.original_name, 'isCurrent', i.status = 'committed')
      INTO v_previous
      FROM app.import_files i
      WHERE i.company_id = p_company AND i.kind = 'fec' AND i.id::text = f.report ->> 'supersededImportId';
    SELECT jsonb_build_object('importId', i.id, 'fileName', i.original_name, 'isCurrent', i.status = 'committed')
      INTO v_newer
      FROM app.import_files i
      WHERE i.company_id = p_company AND i.kind = 'fec' AND i.report ->> 'supersededImportId' = p_import::text
      LIMIT 1;
  ELSE
    SELECT count(*) INTO v_bank FROM app.bank_transactions t WHERE t.source_import_id = p_import AND t.company_id = p_company;
    v_is_current := true;
    -- Un import ultérieur du même compte a pu ignorer des opérations comme doublons de celles-ci :
    -- les supprimer ferait disparaître des données de cet import ultérieur. Blocage explicite.
    SELECT string_agg(DISTINCT '« ' || o.original_name || ' »', ', ') INTO v_dup_imports
      FROM app.import_files o
      WHERE o.company_id = p_company AND o.kind = 'bank_transactions' AND o.bank_account_id = f.bank_account_id
        AND o.id <> p_import AND o.status = 'committed' AND o.created_at > f.created_at
        AND EXISTS (SELECT 1 FROM app.import_rows r WHERE r.import_file_id = o.id AND r.status = 'duplicate');
    IF v_dup_imports IS NOT NULL THEN
      v_blockers := v_blockers || to_jsonb(
        ('Des imports plus récents du même compte (' || v_dup_imports || ') ont ignoré des opérations '
         || 'comme doublons de celui-ci : supprimez-les d''abord, puis réimportez-les après cette suppression.')::text);
    END IF;
  END IF;

  -- Plan de comptes : comptes découverts par cet import.
  WITH firsts AS (
    SELECT c.account_number, c.mapping_status FROM app.chart_of_accounts c
    WHERE c.company_id = p_company AND c.first_seen_import_id = p_import
  ), used AS (
    SELECT DISTINCT l.account_number FROM app.trial_balance_lines l
      JOIN app.trial_balances b ON b.id = l.trial_balance_id
      WHERE l.company_id = p_company AND b.source_import_id <> p_import
        AND l.account_number IN (SELECT account_number FROM firsts)
    UNION
    SELECT DISTINCT e.account_number FROM app.accounting_entries e
      WHERE e.company_id = p_company AND e.import_file_id <> p_import
        AND e.account_number IN (SELECT account_number FROM firsts)
  )
  SELECT
    count(*) FILTER (WHERE f2.account_number IN (SELECT account_number FROM used)),
    count(*) FILTER (WHERE f2.account_number NOT IN (SELECT account_number FROM used) AND f2.mapping_status = 'manual'),
    count(*) FILTER (WHERE f2.account_number NOT IN (SELECT account_number FROM used) AND f2.mapping_status <> 'manual')
  INTO v_acc_reassign, v_acc_keep, v_acc_delete
  FROM firsts f2;

  RETURN jsonb_build_object(
    'import', jsonb_build_object(
      'id', f.id, 'kind', f.kind, 'status', f.status, 'fileName', f.original_name,
      'fiscalYearId', f.fiscal_year_id, 'periodEnd', f.period_end, 'dataStatus', f.data_status,
      'bankAccountId', f.bank_account_id, 'committedAt', f.committed_at),
    'counts', jsonb_build_object(
      'trialBalances', v_tb_count, 'trialBalanceLines', v_tb_lines, 'accountingEntries', v_entries,
      'bankTransactions', v_bank, 'importRows', v_rows),
    'accounts', jsonb_build_object('reassigned', v_acc_reassign, 'keptManual', v_acc_keep, 'deleted', v_acc_delete),
    'versions', jsonb_build_object('isCurrent', v_is_current, 'previous', v_previous, 'newer', v_newer),
    'remainingSources', jsonb_build_object(
      'trialBalance', EXISTS (SELECT 1 FROM app.trial_balances b WHERE b.company_id = p_company AND b.is_current AND b.source_import_id <> p_import),
      'fec', EXISTS (SELECT 1 FROM app.accounting_entries e WHERE e.company_id = p_company AND e.import_file_id <> p_import),
      'bank', EXISTS (SELECT 1 FROM app.bank_transactions t WHERE t.company_id = p_company AND t.source_import_id <> p_import)),
    'storage', jsonb_build_object('sharedWith', v_shared),
    'blockers', v_blockers);
END
$$;
--> statement-breakpoint

-- ───────────── Suppression définitive, atomique ─────────────
CREATE FUNCTION app.delete_import(p_company uuid, p_import uuid, p_reactivate_previous boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_plan jsonb;
  f app.import_files%ROWTYPE;
  tb app.trial_balances%ROWTYPE;
  v_lines int := 0;
  v_entries int := 0;
  v_bank int := 0;
  v_rows int := 0;
  v_reassigned int := 0;
  v_detached int := 0;
  v_deleted_acc int := 0;
  v_reactivated uuid := NULL;
  v_queued uuid := NULL;
  v_prev_fec uuid;
BEGIN
  IF NOT app.is_company_admin(p_company) THEN
    RAISE EXCEPTION 'import_deletion_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Verrou : une seule suppression à la fois pour cet import.
  SELECT * INTO f FROM app.import_files i WHERE i.id = p_import AND i.company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'import_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  v_plan := app.import_deletion_plan(p_company, p_import);
  IF jsonb_array_length(v_plan -> 'blockers') > 0 THEN
    RAISE EXCEPTION 'import_deletion_blocked: %', v_plan -> 'blockers' ->> 0 USING ERRCODE = 'check_violation';
  END IF;

  -- 1) Plan de comptes : rattacher à l'import le plus ancien qui utilise encore le compte ;
  --    sinon conserver les rattachements manuels (sans source), et supprimer les autres.
  UPDATE app.chart_of_accounts c
  SET first_seen_import_id = u.import_id, updated_at = now()
  FROM (
    SELECT DISTINCT ON (x.account_number) x.account_number, x.import_id
    FROM (
      SELECT l.account_number, b.source_import_id AS import_id, i.created_at
        FROM app.trial_balance_lines l
        JOIN app.trial_balances b ON b.id = l.trial_balance_id
        JOIN app.import_files i ON i.id = b.source_import_id
        WHERE l.company_id = p_company AND b.source_import_id <> p_import
          AND l.account_number IN (SELECT account_number FROM app.chart_of_accounts
                                   WHERE company_id = p_company AND first_seen_import_id = p_import)
      UNION ALL
      SELECT e.account_number, e.import_file_id, i.created_at
        FROM app.accounting_entries e
        JOIN app.import_files i ON i.id = e.import_file_id
        WHERE e.company_id = p_company AND e.import_file_id <> p_import
          AND e.account_number IN (SELECT account_number FROM app.chart_of_accounts
                                   WHERE company_id = p_company AND first_seen_import_id = p_import)
    ) x
    ORDER BY x.account_number, x.created_at
  ) u
  WHERE c.company_id = p_company AND c.first_seen_import_id = p_import AND c.account_number = u.account_number;
  GET DIAGNOSTICS v_reassigned = ROW_COUNT;

  UPDATE app.chart_of_accounts c SET first_seen_import_id = NULL, updated_at = now()
  WHERE c.company_id = p_company AND c.first_seen_import_id = p_import AND c.mapping_status = 'manual';
  GET DIAGNOSTICS v_detached = ROW_COUNT;

  DELETE FROM app.chart_of_accounts c WHERE c.company_id = p_company AND c.first_seen_import_id = p_import;
  GET DIAGNOSTICS v_deleted_acc = ROW_COUNT;

  -- 2) Lignes en anomalie tracées.
  DELETE FROM app.import_rows r WHERE r.import_file_id = p_import AND r.company_id = p_company;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- 3) Données normalisées et historique des versions.
  IF f.kind = 'trial_balance' THEN
    SELECT * INTO tb FROM app.trial_balances b WHERE b.source_import_id = p_import AND b.company_id = p_company;
    IF FOUND THEN
      -- Version plus récente : elle est rattachée à la version précédente (chaîne conservée).
      UPDATE app.trial_balances n SET supersedes_id = tb.supersedes_id
      WHERE n.supersedes_id = tb.id AND n.company_id = p_company;
      DELETE FROM app.trial_balance_lines l WHERE l.trial_balance_id = tb.id AND l.company_id = p_company;
      GET DIAGNOSTICS v_lines = ROW_COUNT;
      DELETE FROM app.trial_balances b WHERE b.id = tb.id AND b.company_id = p_company;
      -- Réactivation de la version précédente : uniquement sur demande explicite.
      IF p_reactivate_previous AND tb.is_current AND tb.supersedes_id IS NOT NULL THEN
        UPDATE app.trial_balances p SET is_current = true
        WHERE p.id = tb.supersedes_id AND p.company_id = p_company
        RETURNING p.source_import_id INTO v_reactivated;
        UPDATE app.import_files i SET status = 'committed' WHERE i.id = v_reactivated AND i.company_id = p_company;
      END IF;
    END IF;
  ELSIF f.kind = 'fec' THEN
    DELETE FROM app.accounting_entries e WHERE e.import_file_id = p_import AND e.company_id = p_company;
    GET DIAGNOSTICS v_entries = ROW_COUNT;
    v_prev_fec := NULLIF(f.report ->> 'supersededImportId', '')::uuid;
    -- Une version plus récente qui remplaçait celle-ci remplace désormais la précédente.
    UPDATE app.import_files i
    SET report = jsonb_set(i.report, '{supersededImportId}', COALESCE(to_jsonb(v_prev_fec::text), 'null'::jsonb))
    WHERE i.company_id = p_company AND i.kind = 'fec' AND i.report ->> 'supersededImportId' = p_import::text;
    IF p_reactivate_previous AND f.status = 'committed' AND v_prev_fec IS NOT NULL THEN
      UPDATE app.import_files i SET status = 'committed'
      WHERE i.id = v_prev_fec AND i.company_id = p_company AND i.status = 'superseded'
      RETURNING i.id INTO v_reactivated;
    END IF;
  ELSE
    DELETE FROM app.bank_transactions t WHERE t.source_import_id = p_import AND t.company_id = p_company;
    GET DIAGNOSTICS v_bank = ROW_COUNT;
  END IF;

  -- 4) Fichier stocké : suppression planifiée seulement s'il n'est plus référencé.
  IF NOT EXISTS (SELECT 1 FROM app.import_files o WHERE o.company_id = p_company AND o.storage_key = f.storage_key AND o.id <> p_import) THEN
    INSERT INTO app.storage_cleanup_queue (company_id, storage_key, import_file_id)
    VALUES (p_company, f.storage_key, p_import) RETURNING id INTO v_queued;
  END IF;

  -- 5) Enregistrement de l'import.
  DELETE FROM app.import_files i WHERE i.id = p_import AND i.company_id = p_company;

  PERFORM app.bump_data_version(p_company);

  INSERT INTO app.audit_log (actor_user_id, actor_kind, firm_id, company_id, action, object_type, object_id, outcome, details)
  VALUES (app.current_user_id(), 'user', app.company_firm_id(p_company), p_company, 'import.delete', 'import_file',
          p_import::text, 'success',
          jsonb_build_object(
            'kind', f.kind, 'fileName', f.original_name, 'previousStatus', f.status,
            'deleted', jsonb_build_object('trialBalanceLines', v_lines, 'accountingEntries', v_entries,
                                          'bankTransactions', v_bank, 'importRows', v_rows, 'accounts', v_deleted_acc),
            'accountsReassigned', v_reassigned, 'accountsKeptManual', v_detached,
            'reactivatedImportId', v_reactivated,
            'storage', CASE WHEN v_queued IS NULL THEN 'shared' ELSE 'queued' END));

  RETURN jsonb_build_object(
    'trialBalanceLines', v_lines, 'accountingEntries', v_entries, 'bankTransactions', v_bank,
    'importRows', v_rows, 'accountsDeleted', v_deleted_acc, 'accountsReassigned', v_reassigned,
    'accountsKeptManual', v_detached, 'reactivatedImportId', v_reactivated, 'storageCleanupId', v_queued);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.import_deletion_plan(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.delete_import(uuid, uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.import_deletion_plan(uuid, uuid) TO app_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.delete_import(uuid, uuid, boolean) TO app_runtime;
