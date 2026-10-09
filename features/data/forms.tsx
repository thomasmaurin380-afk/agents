"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import type { FormState } from "@/lib/form-state";
import {
  createBankAccountAction, createFiscalYearAction, mapAccountAction, uploadImportAction,
} from "./actions";

const initial: FormState = { ok: false };

function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert variant={state.ok ? "info" : "destructive"}>{state.message}</Alert>;
}

export function FiscalYearForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(createFiscalYearAction.bind(null, companyId), initial);
  return (
    <form action={action} className="space-y-3" key={JSON.stringify(state.values ?? {})}>
      <Status state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fy-start">Début</Label>
          <Input id="fy-start" name="startDate" type="date" required defaultValue={state.values?.startDate} />
          <FieldError messages={state.fieldErrors?.startDate} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fy-end">Fin</Label>
          <Input id="fy-end" name="endDate" type="date" required defaultValue={state.values?.endDate} />
          <FieldError messages={state.fieldErrors?.endDate} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fy-label">Libellé (facultatif)</Label>
          <Input id="fy-label" name="label" placeholder="Exercice 2025" defaultValue={state.values?.label} />
        </div>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>Ajouter l&apos;exercice</Button>
    </form>
  );
}

export function BankAccountForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(createBankAccountAction.bind(null, companyId), initial);
  return (
    <form action={action} className="space-y-3" key={JSON.stringify(state.values ?? {})}>
      <Status state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ba-bank">Banque</Label>
          <Input id="ba-bank" name="bankName" required defaultValue={state.values?.bankName} />
          <FieldError messages={state.fieldErrors?.bankName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ba-label">Nom du compte</Label>
          <Input id="ba-label" name="label" placeholder="Compte courant" required defaultValue={state.values?.label} />
          <FieldError messages={state.fieldErrors?.label} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ba-iban">4 derniers caractères de l&apos;IBAN</Label>
          <Input id="ba-iban" name="ibanLast4" maxLength={4} defaultValue={state.values?.ibanLast4} />
          <FieldError messages={state.fieldErrors?.ibanLast4} />
        </div>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>Ajouter le compte</Button>
    </form>
  );
}

type Option = { id: string; label: string };

export function UploadForm({
  companyId,
  fiscalYears,
  bankAccounts,
  defaultKind,
}: {
  companyId: string;
  fiscalYears: (Option & { endDate: string })[];
  bankAccounts: Option[];
  defaultKind: string;
}) {
  const [state, action, pending] = useActionState(uploadImportAction.bind(null, companyId), initial);
  const [kind, setKind] = useState(state.values?.kind ?? defaultKind);
  const [fyId, setFyId] = useState(state.values?.fiscalYearId ?? fiscalYears.at(-1)?.id ?? "");
  const fy = fiscalYears.find((f) => f.id === fyId);
  const err = (k: string) => state.fieldErrors?.[k];
  const needsFy = kind !== "bank_transactions";
  const missing =
    needsFy && fiscalYears.length === 0
      ? "Créez d'abord un exercice comptable."
      : !needsFy && bankAccounts.length === 0
        ? "Créez d'abord un compte bancaire."
        : null;

  return (
    <form action={action} className="space-y-5" encType="multipart/form-data">
      {state.message && !state.ok ? (
        <Alert variant="destructive">
          {state.message}
          {state.fieldErrors?.file ? ` — ${state.fieldErrors.file.join(" ")}` : ""}
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="kind">Type de données</Label>
        <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="trial_balance">Balance comptable (CSV, XLSX)</option>
          <option value="fec">Fichier des écritures comptables — FEC (TXT)</option>
          <option value="bank_transactions">Relevé bancaire (CSV, XLSX)</option>
        </Select>
      </div>
      {needsFy ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="fiscalYearId">Exercice</Label>
            <Select id="fiscalYearId" name="fiscalYearId" value={fyId} onChange={(e) => setFyId(e.target.value)}>
              {fiscalYears.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
            <FieldError messages={err("fiscalYearId")} />
          </div>
          {kind === "trial_balance" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="periodEnd">Date d&apos;arrêté de la balance</Label>
                <Input id="periodEnd" name="periodEnd" type="date" required key={fy?.id} defaultValue={state.values?.periodEnd ?? fy?.endDate} />
                <FieldError messages={err("periodEnd")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dataStatus">Statut des données</Label>
                <Select id="dataStatus" name="dataStatus" defaultValue={state.values?.dataStatus ?? "provisional"}>
                  <option value="provisional">Provisoire (situation intermédiaire)</option>
                  <option value="final">Définitive (comptes arrêtés)</option>
                </Select>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="bankAccountId">Compte bancaire</Label>
          <Select id="bankAccountId" name="bankAccountId" defaultValue={state.values?.bankAccountId}>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </Select>
          <FieldError messages={err("bankAccountId")} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="file">Fichier (20 Mo maximum)</Label>
        <Input id="file" name="file" type="file" accept=".csv,.txt,.xlsx,text/csv,text/plain" required />
        <p className="text-xs text-muted-foreground">
          Le fichier original est conservé à l&apos;identique (empreinte SHA-256). Rien n&apos;est enregistré dans les
          données avant votre validation.
        </p>
      </div>
      {missing ? <Alert variant="warning">{missing}</Alert> : null}
      <Button type="submit" disabled={pending || missing != null}>{pending ? "Analyse…" : "Téléverser et analyser"}</Button>
    </form>
  );
}

export function MapAccountForm({ companyId, accountNumber }: { companyId: string; accountNumber: string }) {
  const [state, action, pending] = useActionState(mapAccountAction.bind(null, companyId), initial);
  const [rule, setRule] = useState("none");
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="accountNumber" value={accountNumber} />
      <div>
        <Input name="pcgAccount" placeholder="Compte PCG (ex. 401)" className="h-8 w-36" aria-label={`Compte PCG pour ${accountNumber}`} defaultValue={state.values?.pcgAccount} required />
        <FieldError messages={state.fieldErrors?.pcgAccount} />
      </div>
      <Select name="createRule" className="h-8 w-48" value={rule} onChange={(e) => setRule(e.target.value)} aria-label="Règle">
        <option value="none">Sans règle</option>
        <option value="prefix">Règle : comptes commençant par…</option>
        <option value="exact">Règle : ce compte exactement</option>
      </Select>
      {rule === "prefix" ? (
        <Input name="rulePattern" className="h-8 w-28" defaultValue={accountNumber.replace(/\d+$/, "").slice(0, 3) || accountNumber.slice(0, 1)} aria-label="Préfixe" />
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Rattacher</Button>
      {state.message ? <p className={`w-full text-xs ${state.ok ? "text-success" : "text-destructive"}`}>{state.message}</p> : null}
    </form>
  );
}
