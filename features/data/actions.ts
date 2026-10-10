"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorToFormState, formValues, type FormState } from "@/lib/form-state";
import { requireStaff } from "@/lib/guards";
import { createBankAccount, createFiscalYear, mapAccount } from "@/services/company-data";
import { deleteImport, processStorageCleanup } from "@/services/import-deletion";
import { cancelImport, commitImport, saveMapping, uploadImport } from "@/services/imports";

export async function createFiscalYearAction(companyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  try {
    await createFiscalYear(actor, companyId, {
      startDate: formData.get("startDate"), endDate: formData.get("endDate"), label: formData.get("label") || undefined,
    });
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
  revalidatePath(`/daf/c/${companyId}/data`);
  return { ok: true, message: "Exercice créé." };
}

export async function createBankAccountAction(companyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  try {
    await createBankAccount(actor, companyId, {
      bankName: formData.get("bankName"), label: formData.get("label"), ibanLast4: formData.get("ibanLast4") ?? "",
    });
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
  revalidatePath(`/daf/c/${companyId}/data`);
  return { ok: true, message: "Compte bancaire créé." };
}

export async function uploadImportAction(companyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) {
    return { ok: false, message: "Formulaire invalide", fieldErrors: { file: ["Choisissez un fichier."] }, values: formValues(formData) };
  }
  const kind = String(formData.get("kind") ?? "");
  let id: string;
  try {
    ({ id } = await uploadImport(actor, companyId, {
      kind: kind as "trial_balance",
      fiscalYearId: String(formData.get("fiscalYearId") ?? ""),
      periodEnd: String(formData.get("periodEnd") ?? ""),
      dataStatus: String(formData.get("dataStatus") ?? "") as "final",
      bankAccountId: String(formData.get("bankAccountId") ?? ""),
      file: { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) },
    } as Parameters<typeof uploadImport>[2]));
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
  redirect(`/daf/c/${companyId}/imports/${id}`);
}

export async function saveMappingAction(companyId: string, importId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const columns: Record<string, number | null> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("col_")) columns[k.slice(4)] = v === "" ? null : Number(v);
  }
  try {
    await saveMapping(actor, companyId, importId, {
      headerRow: Number(formData.get("headerRow")) - 1,
      amountMode: formData.get("amountMode"),
      columns,
    });
  } catch (e) {
    return errorToFormState(e);
  }
  revalidatePath(`/daf/c/${companyId}/imports/${importId}`);
  return { ok: true, message: "Correspondance appliquée : contrôles recalculés." };
}

export async function commitImportAction(companyId: string, importId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  try {
    await commitImport(actor, companyId, importId, {
      confirmSupersede: formData.get("confirmSupersede") === "on",
      saveTemplate: formData.get("saveTemplate") === "on",
    });
  } catch (e) {
    return errorToFormState(e);
  }
  revalidatePath(`/daf/c/${companyId}/data`);
  revalidatePath(`/daf/c/${companyId}/imports/${importId}`);
  return { ok: true };
}

export async function cancelImportAction(companyId: string, importId: string): Promise<void> {
  const actor = await requireStaff();
  await cancelImport(actor, companyId, importId);
  redirect(`/daf/c/${companyId}/data`);
}

export async function mapAccountAction(companyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  try {
    const r = await mapAccount(actor, companyId, {
      accountNumber: formData.get("accountNumber"),
      pcgAccount: formData.get("pcgAccount"),
      createRule: formData.get("createRule") ?? "none",
      rulePattern: formData.get("rulePattern") || undefined,
    });
    revalidatePath(`/daf/c/${companyId}/accounts`);
    return { ok: true, message: r.appliedToOthers > 0 ? `Compte rattaché ; la règle a aussi rattaché ${r.appliedToOthers} autre(s) compte(s).` : "Compte rattaché." };
  } catch (e) {
    return errorToFormState(e, formValues(formData));
  }
}

export async function deleteImportAction(companyId: string, importId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireStaff();
  let outcome: Awaited<ReturnType<typeof deleteImport>>;
  try {
    outcome = await deleteImport(actor, companyId, importId, {
      confirmation: String(formData.get("confirmation") ?? ""),
      reactivatePrevious: formData.get("reactivatePrevious") === "on",
    });
  } catch (e) {
    return errorToFormState(e);
  }
  revalidatePath(`/daf/c/${companyId}`, "layout");
  revalidatePath(`/client/${companyId}`, "layout");
  const q = new URLSearchParams({ supprime: outcome.fileName, stockage: outcome.storage.pending > 0 ? "en-attente" : "ok" });
  redirect(`/daf/c/${companyId}/data?${q}`);
}

export async function retryStorageCleanupAction(companyId: string): Promise<void> {
  const actor = await requireStaff();
  await processStorageCleanup(actor, companyId);
  revalidatePath(`/daf/c/${companyId}/data`);
}
