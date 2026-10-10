"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { FormState } from "@/lib/form-state";
import { deleteImportAction } from "./actions";

export type DeletionView = {
  fileName: string;
  companyName: string;
  kindLabel: string;
  statusLabel: string;
  periodLabel: string | null;
  deletes: string[];
  consequences: string[];
  blockers: string[];
  canDelete: boolean;
  canReactivate: { fileName: string } | null;
};

/** Suppression définitive d'un import enregistré : récapitulatif, conséquences, saisie de SUPPRIMER. */
export function DeleteImportDialog({
  companyId,
  importId,
  view,
  defaultOpen,
}: {
  companyId: string;
  importId: string;
  view: DeletionView;
  defaultOpen: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(deleteImportAction.bind(null, companyId, importId), { ok: false });

  useEffect(() => {
    if (defaultOpen) ref.current?.showModal();
  }, [defaultOpen]);

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => ref.current?.showModal()} data-testid="open-delete-import">
        <Trash2 /> Supprimer définitivement l&apos;import
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="delete-import-title"
        className="w-[min(36rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50"
      >
        <form action={action} className="space-y-4 p-5" data-testid="delete-import-dialog">
          <h2 id="delete-import-title" className="text-lg font-semibold">Supprimer définitivement cet import ?</h2>
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Fichier</dt><dd className="font-medium break-all">{view.fileName}</dd>
            <dt className="text-muted-foreground">Entreprise</dt><dd>{view.companyName}</dd>
            <dt className="text-muted-foreground">Type</dt><dd>{view.kindLabel}</dd>
            {view.periodLabel ? (<><dt className="text-muted-foreground">Exercice / période</dt><dd>{view.periodLabel}</dd></>) : null}
            <dt className="text-muted-foreground">Statut actuel</dt><dd>{view.statusLabel}</dd>
          </dl>
          <div>
            <p className="mb-1 text-sm font-medium">Seront supprimés :</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm" data-testid="delete-volumes">
              {view.deletes.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Conséquences :</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {view.consequences.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          {view.blockers.length > 0 ? (
            <Alert variant="destructive" data-testid="delete-blockers">{view.blockers.join(" ")}</Alert>
          ) : !view.canDelete ? (
            <Alert variant="warning">Seul un administrateur DAF (double authentification vérifiée) peut supprimer un import enregistré.</Alert>
          ) : (
            <>
              {view.canReactivate ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="reactivatePrevious" className="mt-0.5" />
                  <span>Réactiver la version précédente (« {view.canReactivate.fileName} ») comme version courante.</span>
                </label>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="confirmation">Pour confirmer, saisissez <strong>SUPPRIMER</strong></Label>
                <Input id="confirmation" name="confirmation" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
                <FieldError messages={state.fieldErrors?.confirmation} />
              </div>
              {state.message ? <Alert variant="destructive">{state.message}</Alert> : null}
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => ref.current?.close()}>Conserver l&apos;import</Button>
            {view.blockers.length === 0 && view.canDelete ? (
              <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== "SUPPRIMER"}>
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </Button>
            ) : null}
          </div>
        </form>
      </dialog>
    </>
  );
}
