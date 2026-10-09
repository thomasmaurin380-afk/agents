import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/session";
import { getActor, isStaff } from "@/services/actor";

/** Aiguillage après connexion selon le profil. */
export default async function HomePage() {
  const actor = await getActor();
  if (!actor) {
    const session = await getAuthSession();
    redirect(session ? "/no-access" : "/login");
  }
  if (isStaff(actor)) redirect("/daf/portfolio");
  if (actor.clientCompanies.length > 0) redirect("/client");
  redirect("/no-access");
}
