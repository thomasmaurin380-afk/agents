import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Jeton aléatoire 256 bits (URL-safe). Seul son hash est stocké. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
