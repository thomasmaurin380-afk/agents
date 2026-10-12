import { expect, test } from "@playwright/test";
import { login, loginStaff, USERS } from "./helpers";

// Préférence « Mode d'interface » : bascule immédiate, persistance, isolation par utilisateur.
test("mode d'interface : bascule, mémorisation et isolation entre comptes", async ({ page, browser }) => {
  await loginStaff(page, USERS.admin);
  const shell = page.locator("[data-ui-mode]").first();
  await expect(shell).toHaveAttribute("data-ui-mode", "analyse");

  await page.getByRole("button", { name: /Préférences d'affichage/ }).click();
  const dialog = page.getByRole("dialog", { name: "Préférences d'affichage" });
  await dialog.getByRole("radio", { name: /Pilotage financier/ }).click();
  await expect(shell).toHaveAttribute("data-ui-mode", "pilotage");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.locator("[data-ui-mode]").first()).toHaveAttribute("data-ui-mode", "pilotage");
  // Les pages fonctionnelles restent intactes.
  await expect(page.getByTestId("portfolio-table")).toBeVisible();

  // Un autre compte sur le même navigateur ne reçoit pas la préférence.
  const context = page.context();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL(/\/login/);
  await login(page, USERS.services);
  await page.waitForURL(/\/client/);
  await expect(page.locator("[data-ui-mode]").first()).toHaveAttribute("data-ui-mode", "analyse");
  expect((await context.cookies()).find((c) => c.name === "daf_ui_mode")).toBeTruthy();

  // Revenir au mode d'origine pour les autres campagnes.
  const p2 = await browser.newPage();
  await loginStaff(p2, USERS.admin);
  await p2.getByRole("button", { name: /Préférences d'affichage/ }).click();
  await p2.getByRole("radio", { name: /Analyse financière/ }).click();
  await expect(p2.locator("[data-ui-mode]").first()).toHaveAttribute("data-ui-mode", "analyse");
  await p2.close();
});
