import { expect, test, type Page } from "@playwright/test";
import { loginStaff, USERS } from "./helpers";

// Maquette V4 (deux modes d'interface) : uniquement avec l'aperçu de conception activé.
test.skip(process.env.DESIGN_PREVIEW !== "1", "aperçu de conception non activé (DESIGN_PREVIEW=1)");

const dashboard = (page: Page) => page.locator("[data-dashboard]");
const shortcut = (page: Page) => page.getByTestId("mode-shortcut");

async function openDashboard(page: Page) {
  await page.getByRole("link", { name: "Tableau de bord" }).first().click();
  await page.waitForURL(/\/daf\/maquette/);
  await expect(dashboard(page)).not.toHaveAttribute("data-mode", "pending");
}

test("deux compositions distinctes, bascule immédiate et réversible, préférence conservée", async ({ page }) => {
  await loginStaff(page, USERS.admin);
  await openDashboard(page);

  // Mode par défaut : Analyse (bilan, entités, détail des postes).
  await expect(dashboard(page)).toHaveAttribute("data-mode", "analyse");
  await expect(page.getByRole("heading", { name: "Analyse par entité" })).toBeVisible();
  await expect(page.locator('[data-kpi="actifs"]')).toContainText("4 451 508 €");
  await expect(page.locator('[data-kpi="endettement"]')).toContainText("55,1 %");
  await expect(page.getByRole("tab", { name: "Actifs" })).toHaveAttribute("aria-selected", "true");

  // Bascule par le raccourci : autre structure, mêmes données (trésorerie du bilan).
  await shortcut(page).getByRole("radio", { name: "Pilotage" }).click();
  await expect(dashboard(page)).toHaveAttribute("data-mode", "pilotage");
  await expect(page.getByRole("heading", { name: "Analyse par entité" })).toHaveCount(0);
  await expect(page.locator('[data-kpi="tresorerie"]')).toContainText("523 410 €");
  await expect(page.locator('[data-kpi="resultat"]')).toContainText("186 540 €");
  await expect(page.getByRole("heading", { name: "Dernières opérations" })).toBeVisible();
  await expect(page.getByTestId("mode-announcement")).toHaveText("Mode Pilotage financier affiché");
  await expect(page.locator("html")).toHaveAttribute("data-interface-mode", "pilotage");

  // Persistance : rechargement et navigation conservent le mode.
  await page.reload();
  await expect(dashboard(page)).toHaveAttribute("data-mode", "pilotage");
  await page.getByRole("link", { name: "Portefeuille clients" }).click();
  await page.waitForURL(/\/daf\/portfolio/);
  await openDashboard(page);
  await expect(dashboard(page)).toHaveAttribute("data-mode", "pilotage");

  // Retour par les préférences d'affichage du profil.
  await page.getByRole("button", { name: "Préférences d'affichage" }).click();
  await page.getByRole("group", { name: "Préférences d'affichage" }).getByRole("radio", { name: /Analyse financière/ }).click();
  await expect(dashboard(page)).toHaveAttribute("data-mode", "analyse");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Préférences d'affichage" })).toBeHidden();
});

test("périmètre conservé entre les modes ; accès clavier au raccourci", async ({ page }) => {
  await loginStaff(page, USERS.admin);
  await openDashboard(page);
  await page.getByTestId("entity-select").selectOption("belgique");
  await expect(page).toHaveURL(/entite=belgique/);
  await expect(page.locator('[data-kpi="actifs"]')).toContainText("612 800 €");

  // Clavier : focus sur le mode actif, flèche droite = Pilotage, le focus suit.
  await shortcut(page).getByRole("radio", { name: "Analyse" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dashboard(page)).toHaveAttribute("data-mode", "pilotage");
  await expect(shortcut(page).getByRole("radio", { name: "Pilotage" })).toBeFocused();
  await expect(page).toHaveURL(/entite=belgique/);
  await expect(page.getByRole("status").filter({ hasText: "Filiale Belgique" })).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(dashboard(page)).toHaveAttribute("data-mode", "analyse");
  await expect(page.getByTestId("entity-select")).toHaveValue("belgique");
  await expect(page.locator('tr[data-selected="true"]')).toContainText("Filiale Belgique");

  // Onglets du détail du bilan au clavier.
  await page.getByRole("tab", { name: "Actifs" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Passifs" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Dettes fournisseurs");
});

test("préférence isolée par utilisateur sur un même navigateur", async ({ page }) => {
  await loginStaff(page, USERS.admin);
  await openDashboard(page);
  await shortcut(page).getByRole("radio", { name: "Pilotage" }).click();
  await expect(dashboard(page)).toHaveAttribute("data-mode", "pilotage");

  // Déconnexion, puis un autre membre du cabinet sur le même navigateur (même stockage local).
  await page.locator("header").getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL(/\/login/);
  await loginStaff(page, USERS.analyst);
  await openDashboard(page);
  await expect(dashboard(page)).toHaveAttribute("data-mode", "analyse");
  // L'analyste choisit Pilotage à son tour : une clé par utilisateur, aucune partagée.
  await shortcut(page).getByRole("radio", { name: "Pilotage" }).click();
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("daf:interface-mode:")));
  expect(keys).toHaveLength(2);

  // L'administrateur revient et retrouve sa propre préférence, puis la change sans affecter l'analyste.
  await page.locator("header").getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL(/\/login/);
  await loginStaff(page, USERS.admin);
  await openDashboard(page);
  await expect(dashboard(page)).toHaveAttribute("data-mode", "pilotage");
  await shortcut(page).getByRole("radio", { name: "Analyse" }).click();
  const values = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("daf:interface-mode:")).map(([, v]) => v).sort());
  expect(values).toEqual(["analyse", "pilotage"]);
});
