import { defineConfig, devices } from "@playwright/test";

// E2E sur l'application de production (next build + start) et la pile de test
// docker/compose.test.yml. Variables : .env.test.
const PORT = 3100;
const executablePath = process.env.PW_CHROMIUM_PATH; // chromium préinstallé (environnements sans téléchargement)

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "fr-FR",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: [
    {
      command: "node scripts/dev/auth-gateway.mjs",
      url: "http://127.0.0.1:54321/auth/v1/health",
      reuseExistingServer: true,
    },
    {
      command: `node --env-file=.env.test node_modules/next/dist/bin/next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
