"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorToFormState, formValues, type FormState } from "@/lib/form-state";
import { requireStaff } from "@/lib/guards";
import { approveRuleSet, publishSig, setAccountOverride, validateSig } from "@/services/sig";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v !== "" ? v : null;
};

export async function validateSigAction(companyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  let id: string;
  try {
    ({ id } = await validateSig(actor, companyId, {
      fiscalYearId: str(formData, "fiscalYearId") ?? "",
      period: (str(formData, "period") ?? "fiscal_year") as "fiscal_year",
      month: str(formData, "month") ? Number(str(formData, "month")) : null,
      source: (str(formData, "source") ?? "auto") as "auto",
      justification: str(formData, "justification"),
    }, str(formData, "contentHash") ?? ""));
  } catch (e) {
    return errorToFormState(e);
  }
  redirect(`/daf/c/${companyId}/sig/v/${id}`);
}

export async function publishSigAction(companyId: string, snapshotId: string, _prev: FormState): Promise<FormState> {
  const actor = await requireStaff();
  try {
    await publishSig(actor, companyId, snapshotId);
  } catch (e) {
    return errorToFormState(e);
  }
  revalidatePath(`/daf/c/${companyId}/sig`);
  revalidatePath(`/daf/c/${companyId}/sig/v/${snapshotId}`);
  return { ok: true, message: "Version publiée : elle est désormais visible dans le portail client." };
}

export async function overrideAction(companyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  try {
    await setAccountOverride(actor, companyId, {
      ruleSetCode: str(formData, "ruleSetCode"), account: str(formData, "account"), line: str(formData, "line"), justification: str(formData, "justification") ?? "",
    });
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
  revalidatePath(`/daf/c/${companyId}/sig`);
  return { ok: true, message: "Classement enregistré : le calcul a été mis à jour." };
}

export async function approveRuleSetAction(ruleSetCode: string, _prev: FormState): Promise<FormState> {
  const actor = await requireStaff();
  try {
    await approveRuleSet(actor, ruleSetCode);
  } catch (e) {
    return errorToFormState(e);
  }
  revalidatePath("/daf/sig-rules");
  return { ok: true, message: "Référentiel validé pour le cabinet." };
}
