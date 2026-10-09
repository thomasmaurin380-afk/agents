import { AccessDeniedError, BusinessRuleError, ValidationError } from "./errors";

export type FormState<T = undefined> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
  /** Valeurs saisies, renvoyées en cas d'erreur pour ne pas vider le formulaire. */
  values?: Record<string, string>;
};

/** Extrait les champs texte d'un FormData (jamais les mots de passe). */
export function formValues(formData: FormData, exclude: readonly string[] = ["password"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$") && !exclude.includes(k)) out[k] = v;
  }
  return out;
}

export const initialFormState: FormState = { ok: false };

/** Traduit une erreur métier en état de formulaire ; relance toute erreur inattendue. */
export function errorToFormState(e: unknown, values?: Record<string, string>): FormState<never> {
  if (e instanceof ValidationError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors, values };
  if (e instanceof BusinessRuleError) return { ok: false, message: e.message, values };
  if (e instanceof AccessDeniedError) return { ok: false, message: "Action non autorisée.", values };
  throw e;
}
