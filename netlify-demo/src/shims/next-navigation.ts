/** Substituts statiques de next/navigation : une seule page, aucun serveur ni routeur. */
export const DEMO_PATH = "/";
export function usePathname() {
  return DEMO_PATH;
}
export function useParams<T extends Record<string, string | undefined>>(): Partial<T> {
  return {};
}
export function useRouter() {
  return { refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} };
}
export function notFound(): never {
  throw new Error("notFound() n'existe pas dans la démonstration statique");
}
