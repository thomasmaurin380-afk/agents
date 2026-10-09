import { CircleAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ImportIssue } from "@/domain/imports/issues";

/** Liste des anomalies : erreurs bloquantes d'abord, avec numéro de ligne du fichier. */
export function IssueList({ issues, total }: { issues: ImportIssue[]; total: number }) {
  if (issues.length === 0) return <p className="text-sm text-success">Aucune anomalie détectée.</p>;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? (a.row ?? 0) - (b.row ?? 0) : a.severity === "error" ? -1 : 1));
  const errors = issues.filter((i) => i.severity === "error").length;
  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <Badge variant="destructive">{errors} erreur(s) bloquante(s)</Badge>
        <Badge variant="warning">{issues.length - errors} avertissement(s)</Badge>
        {total > issues.length ? <span className="text-muted-foreground">({total - issues.length} autres non affichées)</span> : null}
      </div>
      <ul className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2 text-sm" data-testid="issue-list">
        {sorted.map((i, k) => (
          <li key={k} className="flex items-start gap-2">
            {i.severity === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Erreur" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Avertissement" />
            )}
            <span>
              {i.row != null ? <span className="mr-1 font-mono text-xs text-muted-foreground">ligne {i.row}</span> : null}
              {i.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
