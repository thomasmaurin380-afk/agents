"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { initialFormState } from "@/lib/form-state";
import { signInAction } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
