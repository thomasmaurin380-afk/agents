"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { initialFormState } from "@/lib/form-state";
import { acceptAsCurrentUserAction, acceptNewAccountAction } from "./actions";

export function NewAccountForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptNewAccountAction.bind(null, token), initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">Prénom et nom</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} />
        <FieldError messages={state.fieldErrors?.fullName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <p className="text-xs text-muted-foreground">12 caractères minimum, avec majuscule, minuscule et chiffre.</p>
        <FieldError messages={state.fieldErrors?.password} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        Créer mon compte et accepter
      </Button>
    </form>
  );
}

export function AcceptAsCurrentUser({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptAsCurrentUserAction.bind(null, token), initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        Accepter l&apos;invitation
      </Button>
    </form>
  );
}
