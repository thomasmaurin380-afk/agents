/** Violation d'unicité PostgreSQL (23505) sur une contrainte donnée (erreur directe ou enveloppée par Drizzle). */
export function isUniqueViolation(e: unknown, constraint: string): boolean {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const c = err?.cause ?? err;
  return c?.code === "23505" && c?.constraint_name === constraint;
}
