import { bankMappingErrors, type BankMapping } from "./bank";
import type { ImportKind } from "./fields";
import { trialBalanceMappingErrors, type TrialBalanceMapping } from "./trial-balance";

/**
 * Un modèle de correspondance mémorisé n'est réutilisé que s'il reste applicable au fichier :
 * mode de montants connu, colonnes obligatoires présentes, aucune colonne hors du fichier.
 */
export function isMappingCompatible(kind: ImportKind, mapping: unknown, columnCount: number): boolean {
  if (kind === "fec" || mapping == null || typeof mapping !== "object") return false;
  const m = mapping as { headerRow?: unknown; amountMode?: unknown; columns?: Record<string, unknown> };
  if (typeof m.headerRow !== "number" || m.columns == null || typeof m.columns !== "object") return false;
  const modes = kind === "trial_balance" ? ["debit_credit", "signed", "amount_direction"] : ["signed", "debit_credit"];
  if (!modes.includes(String(m.amountMode))) return false;
  for (const v of Object.values(m.columns)) {
    if (v == null) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= columnCount) return false;
  }
  const errs =
    kind === "trial_balance"
      ? trialBalanceMappingErrors(m as unknown as TrialBalanceMapping)
      : bankMappingErrors(m as unknown as BankMapping);
  return errs.length === 0;
}
