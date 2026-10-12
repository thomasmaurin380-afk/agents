import { defineConfig, devices } from "@playwright/test";

// Recette du site statique construit (dist/), servi par un simple serveur de fichiers comme sur
// Netlify : aucun serveur Next.js, aucune variable d'environnement.
const PORT = 4180;
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests",
  // CAPTURES=1 : génère les captures d'écran (tests/shots.capture.ts) au lieu de la recette.
  testMatch: process.env.CAPTURES === "1" ? "**/*.capture.ts" : "**/*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "fr-FR",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory dist`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
  },
});
