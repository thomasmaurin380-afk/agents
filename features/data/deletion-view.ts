import "server-only";
import { IMPORT_KIND_LABELS } from "@/domain/imports/fields";
import type { DeletionPreview } from "@/services/import-deletion";
import type { DeletionView } from "./delete-import-dialog";
import { DATA_STATUS_LABELS, displayValue, IMPORT_STATUS_LABELS } from "./format";

const n = (v: number, one: string, many: string) => `${v.toLocaleString("fr-FR")} ${v > 1 ? many : one}`;

/** Récapitulatif lisible du plan de suppression (fenêtre de confirmation). */
export function toDeletionView(p: DeletionPreview): DeletionView {
  const i = p.import;
  const deletes: string[] = [];
  if (p.counts.trialBalances) deletes.push(`La balance au ${displayValue(i.periodEnd)} (${n(p.counts.trialBalanceLines, "ligne de compte", "lignes de comptes")})`);
  if (p.counts.accountingEntries) deletes.push(n(p.counts.accountingEntries, "ligne d'écriture du FEC", "lignes d'écritures du FEC"));
  if (p.counts.bankTransactions) deletes.push(n(p.counts.bankTransactions, "opération bancaire", "opérations bancaires"));
  if (p.counts.importRows) deletes.push(n(p.counts.importRows, "ligne d'anomalie tracée", "lignes d'anomalies tracées"));
  if (p.accounts.deleted) deletes.push(`${n(p.accounts.deleted, "compte", "comptes")} du plan de comptes, utilisé(s) uniquement par ce fichier`);
  deletes.push("L'enregistrement de l'import (le journal d'audit en garde la trace)");

  const consequences: string[] = [];
  if (p.accounts.reassigned) consequences.push(`${n(p.accounts.reassigned, "compte reste", "comptes restent")} au plan de comptes (utilisés par d'autres imports).`);
  if (p.accounts.keptManual) consequences.push(`${n(p.accounts.keptManual, "compte rattaché manuellement est conservé", "comptes rattachés manuellement sont conservés")}, ainsi que les règles de rattachement.`);
  if (i.kind === "bank_transactions") {
    consequences.push("Ces opérations pourront être réimportées ensuite (elles ne seront plus considérées comme des doublons).");
  }
  if (p.versions.newer) consequences.push(`La version plus récente (« ${p.versions.newer.fileName} ») reste en place et sera rattachée à la version précédente.`);
  if (p.versions.isCurrent && i.kind !== "bank_transactions") {
    consequences.push(
      p.versions.previous
        ? `La version précédente (« ${p.versions.previous.fileName} ») ne sera pas réactivée, sauf si vous le demandez ci-dessous.`
        : i.kind === "trial_balance"
          ? `Il n'y aura plus de balance au ${displayValue(i.periodEnd)}.`
          : "Il n'y aura plus de FEC pour cet exercice.",
    );
  }
  const r = p.remainingSources;
  if (!r.trialBalance && !r.fec && i.kind !== "bank_transactions") {
    consequences.push("Plus aucune donnée comptable : les indicateurs comptables (CA, EBE, résultat) afficheront « Données insuffisantes ».");
  }
  if (!r.bank && i.kind === "bank_transactions") {
    consequences.push("Plus aucune opération bancaire : les indicateurs de trésorerie afficheront « Données insuffisantes ».");
  }
  consequences.push(
    p.storage.sharedWith > 0
      ? `Le fichier original est conservé dans le stockage (utilisé par ${n(p.storage.sharedWith, "autre enregistrement", "autres enregistrements")}).`
      : "Le fichier original sera supprimé du stockage.",
  );
  consequences.push("Action irréversible.");

  return {
    fileName: i.fileName,
    companyName: p.companyName,
    kindLabel: IMPORT_KIND_LABELS[i.kind],
    statusLabel: `${IMPORT_STATUS_LABELS[i.status]}${i.dataStatus ? ` · ${DATA_STATUS_LABELS[i.dataStatus as "final" | "provisional"]}` : ""}`,
    periodLabel: [p.fiscalYearLabel, i.periodEnd ? `arrêté au ${displayValue(i.periodEnd)}` : null, p.bankAccountLabel].filter(Boolean).join(" · ") || null,
    deletes,
    consequences,
    blockers: p.blockers,
    canDelete: p.canDelete,
    canReactivate: p.versions.isCurrent && p.versions.previous ? { fileName: p.versions.previous.fileName } : null,
  };
}
