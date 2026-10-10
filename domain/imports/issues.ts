/** Anomalie détectée pendant l'analyse d'un import. `row` = numéro de ligne dans le fichier (1 = première ligne). */
export type IssueSeverity = "error" | "warning";

export type ImportIssue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  row?: number;
  field?: string;
  /** Colonne du fichier concernée, ex. « col. 3 « Débit » » (renseignée à partir de la correspondance). */
  column?: string;
};

export function error(code: string, message: string, row?: number, field?: string): ImportIssue {
  return { severity: "error", code, message, row, field };
}

export function warning(code: string, message: string, row?: number, field?: string): ImportIssue {
  return { severity: "warning", code, message, row, field };
}

export function hasBlockingErrors(issues: readonly ImportIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Comptage par code, pour le rapport d'import. */
export function countByCode(issues: readonly ImportIssue[]): Record<string, { severity: IssueSeverity; count: number; message: string }> {
  const out: Record<string, { severity: IssueSeverity; count: number; message: string }> = {};
  for (const i of issues) {
    const e = (out[i.code] ??= { severity: i.severity, count: 0, message: i.message });
    e.count++;
  }
  return out;
}
