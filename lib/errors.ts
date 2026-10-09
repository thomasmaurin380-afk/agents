/** Accès refusé : traduit en 404 côté interface pour ne pas révéler l'existence d'une ressource. */
export class AccessDeniedError extends Error {
  constructor(readonly reason: string) {
    super(`Accès refusé : ${reason}`);
    this.name = "AccessDeniedError";
  }
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Authentification requise");
    this.name = "NotAuthenticatedError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class BusinessRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BusinessRuleError";
  }
}
