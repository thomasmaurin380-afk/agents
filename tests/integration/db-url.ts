import { readFileSync } from "node:fs";

/** URL de la base d'intégration : même serveur que DATABASE_URL (.env.test), base dédiée. */
export function baseEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(new URL("../../.env.test", import.meta.url), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  if (process.env.DATABASE_URL) out.DATABASE_URL = process.env.DATABASE_URL;
  return out;
}

export function integrationUrls() {
  const server = new URL(baseEnv().DATABASE_URL);
  const admin = new URL(server);
  const it = new URL(server);
  it.pathname = "/daf_it";
  return { admin: admin.toString(), it: it.toString() };
}
