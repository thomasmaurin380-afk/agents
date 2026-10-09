import { AppShell } from "@/components/layout/app-shell";
import { DafSidebar } from "@/features/navigation/daf-sidebar";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { requireStaff } from "@/lib/guards";

export default async function DafLayout({ children }: LayoutProps<"/daf">) {
  const actor = await requireStaff();
  const role = actor.firms.some((f) => f.role === "firm_admin") ? "firm_admin" : "firm_analyst";
  return (
    <AppShell
      space="daf"
      homeHref="/daf/portfolio"
      sidebar={<DafSidebar isAdmin={role === "firm_admin"} />}
      userName={actor.fullName}
      userRoleLabel={`${ROLE_LABELS[role]} · ${actor.firms[0]?.firmName ?? ""}`}
    >
      {children}
    </AppShell>
  );
}
