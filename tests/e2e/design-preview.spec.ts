import { expect, test } from "@playwright/test";
import { loginStaff, USERS } from "./helpers";

// La maquette de conception (données fictives) n'existe pas hors aperçu explicite (DESIGN_PREVIEW=1).
test.skip(process.env.DESIGN_PREVIEW === "1", "aperçu de conception activé");

test("maquette du tableau de bord : introuvable et absente du menu sans aperçu activé", async ({ page }) => {
  await loginStaff(page, USERS.admin);
  await expect(page.getByRole("link", { name: "Tableau de bord" })).toHaveCount(0);
  const r = await page.goto("/daf/maquette");
  expect(r?.status()).toBe(404);
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
});
