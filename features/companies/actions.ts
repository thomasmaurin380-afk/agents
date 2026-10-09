"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorToFormState, formValues, type FormState } from "@/lib/form-state";
import { requireStaff } from "@/lib/guards";
import { createCompany, setAdvisorAssignment, updateCompany } from "@/services/companies";
import { inviteClient, revokeInvitation } from "@/services/invitations";

function companyFields(formData: FormData) {
  return {
    legalName: formData.get("legalName") ?? "",
    tradeName: formData.get("tradeName") ?? "",
    siren: formData.get("siren") ?? "",
    legalForm: formData.get("legalForm") ?? "",
    nafCode: formData.get("nafCode") ?? "",
    sector: formData.get("sector") ?? "",
    fiscalYearStartMonth: formData.get("fiscalYearStartMonth") ?? "1",
    leadAdvisorId: formData.get("leadAdvisorId") ?? "",
  };
}

export async function createCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  let id: string;
  try {
    ({ id } = await createCompany(actor, companyFields(formData)));
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
  redirect(`/daf/c/${id}`);
}

export async function updateCompanyAction(
  companyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireStaff();
  try {
    await updateCompany(actor, companyId, { ...companyFields(formData), status: formData.get("status") });
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
  revalidatePath(`/daf/c/${companyId}`);
  redirect(`/daf/c/${companyId}`);
}

export async function inviteClientAction(
  companyId: string,
  _prev: FormState<{ url: string; expiresInDays: number }>,
  formData: FormData,
): Promise<FormState<{ url: string; expiresInDays: number }>> {
  const actor = await requireStaff();
  try {
    const data = await inviteClient(actor, companyId, {
      email: formData.get("email"),
      role: formData.get("role"),
    });
    revalidatePath(`/daf/c/${companyId}`);
    return { ok: true, data };
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
}

export async function revokeInvitationAction(companyId: string, invitationId: string): Promise<void> {
  const actor = await requireStaff();
  await revokeInvitation(actor, companyId, invitationId);
  revalidatePath(`/daf/c/${companyId}`);
}

export async function setAdvisorAction(companyId: string, userId: string, assigned: boolean): Promise<void> {
  const actor = await requireStaff();
  await setAdvisorAssignment(actor, companyId, userId, assigned);
  revalidatePath(`/daf/c/${companyId}`);
}
