import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "DemoDaf-2026-Pilotage";
export const USERS = {
  admin: "daf.admin@demo.invalid",
  analyst: "daf.analyste@demo.invalid",
  services: "dirigeant.services@demo.invalid",
  commerce: "dirigeante.commerce@demo.invalid",
  artisan: "dirigeant.artisan@demo.invalid",
} as const;

/** TOTP RFC 6238 (SHA-1, 30 s, 6 chiffres) à partir d'un secret base32. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

const secrets = new Map<string, string>();

/** Connexion d'un membre du cabinet, avec enrôlement TOTP à la première connexion. */
export async function loginStaff(page: Page, email: string) {
  await login(page, email);
  await page.waitForURL(/\/mfa\/(setup|verify)/);
  if (page.url().includes("/mfa/setup")) {
    await page.getByRole("button", { name: "Générer le QR code" }).click();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    secrets.set(email, secret);
    await page.getByLabel("Code à 6 chiffres").fill(totp(secret));
    await page.getByRole("button", { name: "Activer la double authentification" }).click();
  } else {
    const secret = secrets.get(email);
    expect(secret, "secret TOTP connu").toBeTruthy();
    await page.getByLabel(/Code de votre application/).fill(totp(secret!));
    await page.getByRole("button", { name: "Vérifier" }).click();
  }
  await page.waitForURL(/\/daf\/portfolio/);
}
