import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "@/lib/tokens";

describe("Jetons d'invitation", () => {
  it("génère des jetons de 256 bits, uniques, URL-safe", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("hache de façon déterministe (SHA-256 hex) sans révéler le jeton", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
});
