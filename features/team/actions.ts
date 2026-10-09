"use server";

import { errorToFormState, formValues, type FormState } from "@/lib/form-state";
import { requireStaff } from "@/lib/guards";
import { inviteStaff } from "@/services/invitations";

export async function inviteStaffAction(
  _prev: FormState<{ url: string; expiresInDays: number }>,
  formData: FormData,
): Promise<FormState<{ url: string; expiresInDays: number }>> {
  const actor = await requireStaff();
  try {
    const data = await inviteStaff(actor, { email: formData.get("email"), role: formData.get("role") });
    return { ok: true, data };
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
}
