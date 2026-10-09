"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { initialFormState, type FormState } from "@/lib/form-state";
import { COMPANY_STATUS_LABELS, MONTH_OPTIONS } from "./labels";

type Defaults = {
  legalName?: string;
  tradeName?: string | null;
  siren?: string | null;
  legalForm?: string | null;
  nafCode?: string | null;
  sector?: string | null;
  fiscalYearStartMonth?: number;
  leadAdvisorId?: string | null;
  status?: keyof typeof COMPANY_STATUS_LABELS;
};

export function CompanyForm({
  action,
  staff,
  defaults = {},
  withStatus = false,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  staff: { userId: string; fullName: string }[];
  defaults?: Defaults;
  withStatus?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k];
  // Après une erreur, on réaffiche la saisie (React réinitialise le formulaire) ; la clé force
  // le remontage des champs non contrôlés avec ces valeurs.
  const v = (k: keyof Defaults): string =>
    state.values?.[k] ?? (defaults[k] == null ? "" : String(defaults[k]));
  return (
    <form action={formAction} className="grid gap-5 md:grid-cols-2" key={JSON.stringify(state.values ?? {})}>
      {state.message ? (
        <Alert variant="destructive" className="md:col-span-2">
          {state.message}
        </Alert>
      ) : null}
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="legalName">Raison sociale *</Label>
        <Input id="legalName" name="legalName" defaultValue={v("legalName")} required aria-invalid={!!err("legalName")} />
        <FieldError messages={err("legalName")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tradeName">Nom commercial</Label>
        <Input id="tradeName" name="tradeName" defaultValue={v("tradeName")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="siren">SIREN</Label>
        <Input id="siren" name="siren" inputMode="numeric" defaultValue={v("siren")} aria-invalid={!!err("siren")} />
        <FieldError messages={err("siren")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="legalForm">Forme juridique</Label>
        <Input id="legalForm" name="legalForm" placeholder="SAS, SARL, EI…" defaultValue={v("legalForm")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nafCode">Code NAF</Label>
        <Input id="nafCode" name="nafCode" placeholder="62.02A" defaultValue={v("nafCode")} aria-invalid={!!err("nafCode")} />
        <FieldError messages={err("nafCode")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sector">Secteur d&apos;activité</Label>
        <Input id="sector" name="sector" defaultValue={v("sector")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fiscalYearStartMonth">Mois d&apos;ouverture de l&apos;exercice</Label>
        <Select id="fiscalYearStartMonth" name="fiscalYearStartMonth" defaultValue={state.values?.fiscalYearStartMonth ?? String(defaults.fiscalYearStartMonth ?? 1)}>
          {MONTH_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="leadAdvisorId">DAF référent</Label>
        <Select id="leadAdvisorId" name="leadAdvisorId" defaultValue={v("leadAdvisorId")}>
          <option value="">Non attribué</option>
          {staff.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.fullName}
            </option>
          ))}
        </Select>
      </div>
      {withStatus ? (
        <div className="space-y-2">
          <Label htmlFor="status">Statut</Label>
          <Select id="status" name="status" defaultValue={state.values?.status ?? defaults.status ?? "onboarding"}>
            {Object.entries(COMPANY_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
