import { Building } from "lucide-react";

/** Pied de navigation : cabinet de rattachement et rôle (informations existantes). */
export function SidebarFirmCard({ firmName, roleLabel }: { firmName: string; roleLabel: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2/70 px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground">
        <Building className="size-[18px]" strokeWidth={1.6} aria-hidden />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[14px] font-semibold text-foreground">{firmName}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{roleLabel}</p>
      </div>
    </div>
  );
}
