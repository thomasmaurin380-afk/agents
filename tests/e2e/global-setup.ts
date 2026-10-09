import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Base migrée et démonstration réinitialisée avant chaque campagne E2E. */
export default function globalSetup() {
  rmSync("test-results/.totp-secrets.json", { force: true });
  const run = (script: string) =>
    execFileSync(process.execPath, ["--env-file=.env.test", "--import", "tsx", script], { stdio: "inherit" });
  run("scripts/db/migrate.ts");
  run("scripts/db/seed-demo.ts");
}
