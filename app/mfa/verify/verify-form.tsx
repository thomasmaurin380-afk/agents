"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { initialFormState } from "@/lib/form-state";
import { verifyMfaAction } from "../actions";

export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyMfaAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="code">Code de votre application d&apos;authentification</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        Vérifier
      </Button>
    </form>
  );
}
