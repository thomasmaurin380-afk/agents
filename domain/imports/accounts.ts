/**
 * Plan de comptes de l'entreprise → référentiel PCG. Les comptes numériques sont rattachés
 * automatiquement à leur racine ; les autres (comptes alphanumériques, classes 0 et 9) passent
 * par une règle sauvegardée ou restent « à vérifier ».
 */
export type AccountMappingStatus = "auto_validated" | "to_review" | "manual";

export type AccountMappingRule = {
  id: string;
  matchType: "exact" | "prefix";
  pattern: string;
  pcgAccount: string;
};

export type AccountClassification = {
  pcgAccount: string | null;
  pcgClass: number | null;
  isAuxiliary: boolean;
  status: AccountMappingStatus;
  ruleId: string | null;
};

export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[\s.\-_/]/g, "").toUpperCase();
}

/** Racine PCG d'un numéro : chiffres de tête, zéros finaux retirés (3 chiffres minimum). */
export function pcgRoot(digits: string): string {
  let r = digits.replace(/0+$/, "");
  if (r.length < 3) r = digits.slice(0, 3).padEnd(3, "0");
  return r;
}

export function isValidPcgAccount(v: string): boolean {
  return /^[1-8]\d{2,}$/.test(v);
}

export function classifyAccount(
  account: string,
  rules: readonly AccountMappingRule[] = [],
): AccountClassification {
  const acc = normalizeAccountNumber(account);
  const exact = rules.find((r) => r.matchType === "exact" && r.pattern === acc);
  const prefix = rules
    .filter((r) => r.matchType === "prefix" && acc.startsWith(r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  const rule = exact ?? prefix;
  const leading = /^\d+/.exec(acc)?.[0] ?? "";
  const isAuxiliary = leading.length > 0 && leading.length < acc.length;

  if (rule) {
    return {
      pcgAccount: rule.pcgAccount,
      pcgClass: Number(rule.pcgAccount[0]),
      isAuxiliary,
      status: "auto_validated",
      ruleId: rule.id,
    };
  }
  if (leading.length >= 3 && /^[1-8]/.test(leading)) {
    const root = pcgRoot(leading);
    return { pcgAccount: root, pcgClass: Number(root[0]), isAuxiliary, status: "auto_validated", ruleId: null };
  }
  return { pcgAccount: null, pcgClass: null, isAuxiliary, status: "to_review", ruleId: null };
}
