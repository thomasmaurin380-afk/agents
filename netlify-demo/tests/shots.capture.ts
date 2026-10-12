// Captures de la démonstration (exécution manuelle : voir README).
import { test } from "@playwright/test";

for (const mode of ["analyse", "pilotage"] as const) {
  for (const [name, size] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    test(`capture ${mode} ${name}`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem("plateforme-daf-demo:interface-mode", m), mode);
      await page.setViewportSize(size);
      await page.goto("/");
      await page.getByTestId(`dashboard-${mode}`).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `shots/${mode}-${name}.png`, fullPage: true });
    });
  }
}
