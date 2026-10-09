"use server";

import { redirect } from "next/navigation";
import { errorToFormState, formValues, type FormState } from "@/lib/form-state";
import { acceptInvitationAsCurrentUser, acceptInvitationWithNewAccount } from "@/services/invitations";

export async function acceptNewAccountAction(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await acceptInvitationWithNewAccount(token, {
      fullName: formData.get("fullName"),
      password: formData.get("password"),
    });
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
  redirect("/");
}

export async function acceptAsCurrentUserAction(token: string, _prev: FormState): Promise<FormState> {
  try {
    await acceptInvitationAsCurrentUser(token);
  } catch (e) {
    return errorToFormState(e);
  }
  redirect("/");
}
