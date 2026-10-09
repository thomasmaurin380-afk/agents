"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import type { FormState } from "@/lib/form-state";
import { inviteStaffAction } from "./actions";

export function InviteStaffForm() {
  const [state, action, pending] = useActionState<FormState<{ url: string; expiresInDays: number }>, FormData>(
    inviteStaffAction,
    { ok: false },
  );
  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="staff-email">E-mail du collaborateur</Label>
          <Input id="staff-email" name="email" type="email" required />
          <FieldError messages={state.fieldErrors?.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-role">Rôle</Label>
          <Select id="staff-role" name="role" defaultValue="firm_analyst">
            <option value="firm_analyst">{ROLE_LABELS.firm_analyst}</option>
            <option value="firm_admin">{ROLE_LABELS.firm_admin}</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          Inviter
        </Button>
      </form>
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      {state.ok && state.data ? (
        <Alert variant="info" data-testid="invitation-link">
          <p className="mb-1 font-medium">Lien à transmettre (affiché une seule fois, valable {state.data.expiresInDays} jours) :</p>
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{state.data.url}</code>
        </Alert>
      ) : null}
    </div>
  );
}
