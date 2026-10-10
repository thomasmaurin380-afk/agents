import { CircleAlert, Copy, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { issueCategory, ISSUE_HINTS, type IssueCategory } from "@/domain/imports/issue-help";
import type { ImportIssue } from "@/domain/imports/issues";

const SECTIONS: { key: IssueCategory; title: string; badge: "destructive" | "warning" | "secondary" }[] = [
  { key: "error", title: "Erreurs bloquantes", badge: "destructive" },
  { key: "warning", title: "Avertissements", badge: "warning" },
  { key: "duplicate", title: "Doublons et données déjà connues", badge: "secondary" },
];

function Icon({ category }: { category: IssueCategory }) {
  if (category === "error") return <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Erreur bloquante" />;
  if (category === "duplicate") return <Copy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Doublon" />;
  return <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Avertissement" />;
}

/** Anomalies regroupées (bloquantes, avertissements, doublons), avec ligne, colonne et résultat attendu. */
export function IssueList({ issues, total }: { issues: ImportIssue[]; total: number }) {
  if (issues.length === 0) return <p className="text-sm text-success">Aucune anomalie détectée.</p>;
  return (
    <div className="space-y-4" data-testid="issue-list">
      {total > issues.length ? (
        <p className="text-xs text-muted-foreground">{total - issues.length} autre(s) anomalie(s) non affichée(s) (détail conservé dans le rapport).</p>
      ) : null}
      {SECTIONS.map((section) => {
        const list = issues
          .filter((i) => issueCategory(i) === section.key)
          .sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
        if (list.length === 0) return null;
        const hinted = new Set<string>();
        return (
          <section key={section.key} data-testid={`issues-${section.key}`}>
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              {section.title} <Badge variant={section.badge}>{list.length}</Badge>
            </h3>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border p-2 text-sm">
              {list.map((i, k) => {
                const showHint = ISSUE_HINTS[i.code] && !hinted.has(i.code);
                if (showHint) hinted.add(i.code);
                return (
                  <li key={k} className="flex items-start gap-2">
                    <Icon category={section.key} />
                    <span>
                      {i.row != null || i.column ? (
                        <span className="mr-1 font-mono text-xs text-muted-foreground">
                          {[i.row != null ? `ligne ${i.row}` : null, i.column].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                      {i.message}
                      {showHint ? <span className="block text-xs text-muted-foreground">Attendu : {ISSUE_HINTS[i.code]}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
