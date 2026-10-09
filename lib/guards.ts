import "server-only";
import { notFound, redirect } from "next/navigation";
import { AccessDeniedError } from "./errors";
import { getActor, isStaff, type Actor } from "@/services/actor";
import { serverEnv } from "./env";

/** Accès refusé ⇒ 404 : on ne révèle pas l'existence d'une ressource d'un autre tenant. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof AccessDeniedError) notFound();
    throw e;
  }
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Garde de l'espace DAF : personnel du cabinet, second facteur vérifié (D-15). */
export async function requireStaff(): Promise<Actor> {
  const actor = await requireActor();
  if (!isStaff(actor)) redirect(actor.clientCompanies.length > 0 ? "/client" : "/no-access");
  if (serverEnv().REQUIRE_STAFF_MFA && actor.aal !== "aal2") {
    redirect(actor.hasVerifiedTotp ? "/mfa/verify" : "/mfa/setup");
  }
  return actor;
}
