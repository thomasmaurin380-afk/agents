"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { initialFormState } from "@/lib/form-state";
import { startEnrollmentAction, verifyEnrollmentAction } from "../actions";

export function TotpEnrollment() {
  const [factor, setFactor] = useState<{ factorId: string; qrCodeSvg: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, verify, pending] = useActionState(verifyEnrollmentAction, initialFormState);

  if (!factor) {
    return (
      <div className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <p className="text-sm text-muted-foreground">
          Installez une application d&apos;authentification (Google Authenticator, Microsoft Authenticator,
          1Password…), puis générez votre code d&apos;enrôlement.
        </p>
        <Button
          className="w-full"
          disabled={starting}
          onClick={() =>
            startTransition(async () => {
              const r = await startEnrollmentAction();
              if (r.ok && r.data) setFactor(r.data);
              else setError(r.message ?? "Erreur");
            })
          }
        >
          Générer le QR code
        </Button>
      </div>
    );
  }

  return (
    <form action={verify} className="space-y-4">
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- QR code SVG fourni en data URI */}
      <img src={factor.qrCodeSvg} alt="QR code d'enrôlement" className="mx-auto size-44 rounded bg-white p-2" />
      <p className="break-all text-center font-mono text-xs text-muted-foreground" data-testid="totp-secret">
        {factor.secret}
      </p>
      <input type="hidden" name="factorId" value={factor.factorId} />
      <div className="space-y-2">
        <Label htmlFor="code">Code à 6 chiffres</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        Activer la double authentification
      </Button>
    </form>
  );
}
