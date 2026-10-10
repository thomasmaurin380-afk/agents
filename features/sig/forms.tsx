"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import type { FormState } from "@/lib/form-state";
import { approveRuleSetAction, overrideAction, publishSigAction, validateSigAction } from "./actions";

const initial: FormState = { ok: false };

function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert variant={state.ok ? "info" : "destructive"} data-testid="sig-form-status">{state.message}</Alert>;
}

export function ValidateSigForm({ companyId, params, contentHash, disabled }: {
  companyId: string;
  params: Record<string, string>;
  contentHash: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(validateSigAction.bind(null, companyId), initial);
  return (
    <form action={action} className="space-y-2">
      <Status state={state} />
      {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="contentHash" value={contentHash} />
      <Button type="submit" disabled={disabled || pending} data-testid="sig-validate">Valider et figer cette version</Button>
    </form>
  );
}

export function PublishSigForm({ companyId, snapshotId }: { companyId: string; snapshotId: string }) {
  const [state, action, pending] = useActionState(publishSigAction.bind(null, companyId, snapshotId), initial);
  return (
    <form action={action} className="space-y-2">
      <Status state={state} />
      {state.ok ? null : <Button type="submit" disabled={pending} data-testid="sig-publish">Publier au client</Button>}
    </form>
  );
}

export function OverrideForm({ companyId, ruleSetCode, account, proposal, lines }: {
  companyId: string;
  ruleSetCode: string;
  account: string;
  proposal: string | null;
  lines: { code: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(overrideAction.bind(null, companyId), initial);
  const id = `ov-${account}`;
  return (
    <form action={action} className="mt-2 space-y-2 rounded-md border p-3" key={JSON.stringify(state.values ?? {})} data-testid={`override-${account}`}>
      <Status state={state} />
      <input type="hidden" name="ruleSetCode" value={ruleSetCode} />
      <input type="hidden" name="account" value={account} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-line`}>Rubrique retenue</Label>
          <Select id={`${id}-line`} name="line" defaultValue={state.values?.line ?? proposal ?? ""} required>
            <option value="" disabled>Choisir…</option>
            {lines.map((l) => <option key={l.code} value={l.code}>{l.label}{l.code === proposal ? " (proposée)" : ""}</option>)}
          </Select>
          <FieldError messages={state.fieldErrors?.line} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-j`}>Justification</Label>
          <Input id={`${id}-j`} name="justification" required minLength={5} maxLength={500} defaultValue={state.values?.justification} placeholder="Ex. : achats de matières premières (bois)" />
          <FieldError messages={state.fieldErrors?.justification} />
        </div>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Enregistrer le classement</Button>
    </form>
  );
}

export function ApproveRuleSetForm({ ruleSetCode }: { ruleSetCode: string }) {
  const [state, action, pending] = useActionState(approveRuleSetAction.bind(null, ruleSetCode), initial);
  return (
    <form action={action} className="space-y-2">
      <Status state={state} />
      {state.ok ? null : <Button type="submit" disabled={pending} data-testid={`approve-${ruleSetCode}`}>Valider ce référentiel et ses hypothèses</Button>}
    </form>
  );
}
