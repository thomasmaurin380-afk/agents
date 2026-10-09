"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import type { FieldDef } from "@/domain/imports/fields";
import type { FormState } from "@/lib/form-state";
import { commitImportAction, saveMappingAction } from "./actions";

type Mapping = { headerRow: number; amountMode: string; columns: Record<string, number | null | undefined> };

const AMOUNT_MODES: Record<string, { value: string; label: string }[]> = {
  trial_balance: [
    { value: "debit_credit", label: "Deux colonnes : solde débit / solde crédit" },
    { value: "signed", label: "Une colonne de solde signé (positif = débiteur)" },
    { value: "amount_direction", label: "Une colonne de solde + une colonne de sens (D/C)" },
  ],
  bank_transactions: [
    { value: "signed", label: "Une colonne de montant signé (négatif = sortie)" },
    { value: "debit_credit", label: "Deux colonnes : débit (sortie) / crédit (entrée)" },
  ],
};

export function MappingForm({
  companyId,
  importId,
  kind,
  fields,
  headers,
  mapping,
}: {
  companyId: string;
  importId: string;
  kind: "trial_balance" | "bank_transactions";
  fields: FieldDef[];
  headers: string[];
  mapping: Mapping;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMappingAction.bind(null, companyId, importId), { ok: false });
  return (
    <form action={action} className="space-y-4" data-testid="mapping-form">
      {state.message ? <Alert variant={state.ok ? "info" : "destructive"}>{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="headerRow">Ligne d&apos;en-tête (n° de ligne du fichier)</Label>
          <input id="headerRow" name="headerRow" type="number" min={1} defaultValue={mapping.headerRow + 1}
            className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="amountMode">Lecture des montants</Label>
          <Select id="amountMode" name="amountMode" defaultValue={mapping.amountMode}>
            {AMOUNT_MODES[kind].map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`col_${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
            <Select id={`col_${f.key}`} name={`col_${f.key}`} defaultValue={mapping.columns[f.key] == null ? "" : String(mapping.columns[f.key])}>
              <option value="">— non utilisée —</option>
              {headers.map((h, i) => <option key={i} value={i}>{`Col. ${i + 1} : ${h || "(sans titre)"}`}</option>)}
            </Select>
          </div>
        ))}
      </div>
      <Button type="submit" variant="outline" disabled={pending}>Appliquer et recontrôler</Button>
    </form>
  );
}

export function CommitForm({
  companyId,
  importId,
  blocking,
  supersedes,
  canSaveTemplate,
}: {
  companyId: string;
  importId: string;
  blocking: boolean;
  supersedes: string | null;
  canSaveTemplate: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(commitImportAction.bind(null, companyId, importId), { ok: false });
  return (
    <form action={action} className="space-y-3">
      {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
      {supersedes ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmSupersede" className="mt-0.5" />
          <span>Je confirme le remplacement : {supersedes} (l&apos;ancienne version reste dans l&apos;historique).</span>
        </label>
      ) : null}
      {canSaveTemplate ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="saveTemplate" defaultChecked className="mt-0.5" />
          <span>Mémoriser cette correspondance pour les prochains fichiers de même format.</span>
        </label>
      ) : null}
      <Button type="submit" disabled={blocking || pending}>
        {pending ? "Enregistrement…" : "Valider et enregistrer l'import"}
      </Button>
      {blocking ? <p className="text-xs text-destructive">Validation impossible tant que des erreurs bloquantes subsistent.</p> : null}
    </form>
  );
}
