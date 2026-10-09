import { AppShell } from "@/components/layout/app-shell";
import { ROLE_LABELS } from "@/domain/permissions/matrix";
import { ClientSidebar } from "@/features/navigation/client-sidebar";
import { requireActor } from "@/lib/guards";
import { isStaff } from "@/services/actor";

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const actor = await requireActor();
  const staff = isStaff(actor);
  const firstRole = actor.clientCompanies[0]?.role;
  return (
    <AppShell
      space="client"
      homeHref="/client"
      sidebar={
        <ClientSidebar
          previewForStaff={staff}
          companies={actor.clientCompanies.map((c) => ({ companyId: c.companyId, name: c.tradeName ?? c.companyName }))}
        />
      }
      userName={actor.fullName}
      userRoleLabel={staff ? "Aperçu DAF" : firstRole ? ROLE_LABELS[firstRole] : ""}
    >
      {children}
    </AppShell>
  );
}
