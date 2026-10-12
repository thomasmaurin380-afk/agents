import { expect, test, type Page } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:4180";

/** Toutes les requêtes doivent rester sur l'origine du site statique (aucun backend). */
function trackRequests(page: Page) {
  const external: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith("data:")) external.push(r.url()); });
  return external;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("ordinateur : bascule, mémorisation, infobulles, onglets, aucun appel externe", async ({ page }) => {
  const external = trackRequests(page);
  await page.goto("/");
  await expect(page.getByTestId("demo-banner")).toHaveText("Démonstration — données fictives");
  await expect(page.getByTestId("dashboard-analyse")).toBeVisible();
  await expect(page.locator("[data-ui-mode]").first()).toHaveAttribute("data-ui-mode", "analyse");
  await expect(page.getByRole("heading", { name: "Actifs vs Passifs" })).toBeVisible();
  await noHorizontalOverflow(page);

  // Infobulle du graphique (survol puis clavier).
  await page.getByLabel(/^décembre 2026 : Actifs/).hover();
  await expect(page.getByRole("presentation").filter({ hasText: "Actifs" })).toContainText("4 451 508");

  // Onglets du détail du bilan.
  const tabs = page.getByRole("tablist", { name: "Postes du bilan" });
  await tabs.getByRole("tab", { name: "Passifs" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Total des passifs");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Capitaux propres" })).toHaveAttribute("aria-selected", "true");

  // Bascule depuis le raccourci de l'en-tête.
  await page.getByTestId("interface-mode-switch").getByRole("radio", { name: "Pilotage financier" }).click();
  await expect(page.getByTestId("dashboard-pilotage")).toBeVisible();
  await expect(page.getByTestId("dashboard-analyse")).toHaveCount(0);
  await expect(page.locator("[data-ui-mode]").first()).toHaveAttribute("data-ui-mode", "pilotage");
  await expect(page.getByText("Trésorerie disponible")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dernières opérations" })).toBeVisible();
  await noHorizontalOverflow(page);

  // Mémorisation après rechargement (localStorage).
  await page.reload();
  await expect(page.getByTestId("dashboard-pilotage")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("plateforme-daf-demo:interface-mode"))).toBe("pilotage");

  // Infobulle du graphique de performance.
  await page.getByLabel(/^août 2026 : CA/).hover();
  await expect(page.getByRole("presentation").filter({ hasText: "Résultat net cumulé" })).toBeVisible();

  // Bascule depuis les préférences d'affichage du profil, au clavier.
  await page.getByRole("button", { name: /Préférences d'affichage/ }).click();
  const prefs = page.getByRole("dialog", { name: "Préférences d'affichage" });
  await prefs.getByRole("radio", { name: /Analyse financière/ }).click();
  await expect(page.getByTestId("dashboard-analyse")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(prefs).toHaveCount(0);

  // Commandes non implémentées : désactivées.
  await expect(page.getByRole("button", { name: "Se déconnecter" }).first()).toBeDisabled();
  await expect(page.locator('[aria-disabled="true"]', { hasText: "Portefeuille clients" })).toBeVisible();

  expect(external).toEqual([]);
});

test("mobile : menu de navigation, bascule et rendu des deux modes", async ({ page }) => {
  const external = trackRequests(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("dashboard-analyse")).toBeVisible();
  await noHorizontalOverflow(page);

  await page.getByText("Menu", { exact: true }).click();
  const nav = page.locator("#app-nav");
  await expect(nav).toBeVisible();
  await nav.getByRole("radio", { name: /Pilotage financier/ }).click();
  await expect(page.getByTestId("dashboard-pilotage")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await noHorizontalOverflow(page);

  await page.reload();
  await expect(page.getByTestId("dashboard-pilotage")).toBeVisible();
  expect(external).toEqual([]);
});
