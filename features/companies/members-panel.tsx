"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import type { FormState } from "@/lib/form-state";
import { inviteClientAction, revokeInvitationAction, setAdvisorAction } from "./actions";

type InviteState = FormState<{ url: string; expiresInDays: number }>;

export function InviteClientForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    inviteClientAction.bind(null, companyId),
    { ok: false },
  );
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">E-mail du dirigeant ou collaborateur</Label>
          <Input id="invite-email" name="email" type="email" required />
          <FieldError messages={state.fieldErrors?.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Rôle</Label>
          <Select id="invite-role" name="role" defaultValue="client_owner">
            <option value="client_owner">{ROLE_LABELS.client_owner}</option>
            <option value="client_member">{ROLE_LABELS.client_member}</option>
            <option value="client_readonly">{ROLE_LABELS.client_readonly}</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          Créer l&apos;invitation
        </Button>
      </form>
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      {state.ok && state.data ? (
        <Alert variant="info" data-testid="invitation-link">
          <p className="mb-2 font-medium">
            Lien à transmettre (affiché une seule fois, valable {state.data.expiresInDays} jours) :
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{state.data.url}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(state.data!.url);
                setCopied(true);
              }}
            >
              <Copy /> {copied ? "Copié" : "Copier"}
            </Button>
          </div>
        </Alert>
      ) : null}
    </div>
  );
}

export function RevokeInvitationButton({ companyId, invitationId }: { companyId: string; invitationId: string }) {
  return (
    <form action={revokeInvitationAction.bind(null, companyId, invitationId)}>
      <Button type="submit" variant="ghost" size="sm">
        Annuler
      </Button>
    </form>
  );
}

export function AdvisorToggle({
  companyId,
  userId,
  assigned,
  isLead,
}: {
  companyId: string;
  userId: string;
  assigned: boolean;
  isLead: boolean;
}) {
  if (isLead) return <Badge>Référent</Badge>;
  return (
    <form action={setAdvisorAction.bind(null, companyId, userId, !assigned)}>
      <Button type="submit" variant={assigned ? "ghost" : "outline"} size="sm">
        {assigned ? "Retirer" : "Affecter"}
      </Button>
    </form>
  );
}
