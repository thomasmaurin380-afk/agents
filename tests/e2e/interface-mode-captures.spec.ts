import { expect, test, type Page } from "@playwright/test";
import { loginStaff, USERS } from "./helpers";

// Captures de revue (hors campagne) : DESIGN_PREVIEW=1 et CAPTURE_DIR=<dossier>.
test.skip(process.env.DESIGN_PREVIEW !== "1" || !process.env.CAPTURE_DIR, "captures non demandées");

const dir = process.env.CAPTURE_DIR!;

async function setMode(page: Page, mode: "Analyse" | "Pilotage") {
  const radio = page.getByTestId("mode-shortcut").getByRole("radio", { name: mode });
  if ((await radio.getAttribute("aria-checked")) !== "true") await radio.click();
  await expect(page.locator("[data-dashboard]")).toHaveAttribute("data-mode", mode.toLowerCase());
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

/** Page entière sans artefact des éléments collants : la fenêtre prend la hauteur du document. */
async function capture(page: Page, name: string, width: number, hover?: () => Promise<void>) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: h });
  if (hover) await hover();
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test("captures desktop et mobile des deux modes", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginStaff(page, USERS.admin);
  await page.goto("/daf/maquette");

  await setMode(page, "Analyse");
  await capture(page, "analyse-desktop", 1440, () =>
    page.getByRole("img", { name: /Total des actifs et des passifs/ }).locator("rect[tabindex]").nth(11).hover());

  await setMode(page, "Pilotage");
  await capture(page, "pilotage-desktop", 1440, () =>
    page.getByRole("img", { name: /Chiffre d'affaires et résultat net/ }).locator("rect[tabindex]").nth(7).hover());

  await setMode(page, "Analyse");
  await capture(page, "analyse-mobile", 390);
  const overflowA = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await setMode(page, "Pilotage");
  await capture(page, "pilotage-mobile", 390);
  const overflowP = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  // Aucune page plus large que l'écran sur mobile.
  expect(overflowA).toBeLessThanOrEqual(0);
  expect(overflowP).toBeLessThanOrEqual(0);
});

// Démonstration de la bascule : suite d'images (assemblée ensuite en animation), sans ffmpeg.
test("démonstration de la bascule (images successives)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginStaff(page, USERS.analyst);
  await page.goto("/daf/maquette");
  await setMode(page, "Analyse");
  let n = 0;
  const shot = async () => page.screenshot({ path: `${dir}/demo/frame-${String(++n).padStart(2, "0")}.png` });
  await shot();
  await page.getByTestId("entity-select").selectOption("france");
  await expect(page.locator('[data-kpi="actifs"]')).toContainText("2\u202f186\u202f400");
  await shot();
  await page.getByTestId("mode-shortcut").getByRole("radio", { name: "Pilotage" }).click();
  await expect(page.locator("[data-dashboard]")).toHaveAttribute("data-mode", "pilotage");
  await page.mouse.move(0, 0);
  await shot();
  await page.getByRole("button", { name: "Préférences d'affichage" }).click();
  await shot();
  await page.getByRole("group", { name: "Préférences d'affichage" }).getByRole("radio", { name: /Analyse financière/ }).click();
  await expect(page.locator("[data-dashboard]")).toHaveAttribute("data-mode", "analyse");
  await shot();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("entity-select")).toHaveValue("france");
  await shot();
});
