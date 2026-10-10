import { expect, test, type Page } from "@playwright/test";
import { login, loginStaff, USERS } from "./helpers";

// Parcours DAF : Importer → Calculer → Contrôler → Détail → Valider → Publier ; puis portail client.
// Jeu AZUR CONSEIL SA (reconstitué) importé dans « Menuiserie Blanchard » (démo, exercice 2025).
const AZUR = "demo-files/azur-conseil";

async function upload(page: Page, companyId: string, kind: string, file: string, final = false) {
  await page.goto(`/daf/c/${companyId}/imports/new`);
  await page.getByLabel("Type de données").selectOption(kind);
  if (final) await page.getByLabel("Statut des données").selectOption("final");
  await page.getByLabel(/Fichier \(20 Mo/).setInputFiles(`${AZUR}/${file}`);
  await page.getByRole("button", { name: "Téléverser et analyser" }).click();
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Valider et enregistrer l'import" }).click();
  await expect(page.getByTestId("import-status")).toHaveText("Enregistré");
}

test.describe.serial("Phase 3 — SIG", () => {
  let companyId = "";
  let snapshotUrl = "";

  test("DAF : import AZUR, calcul provisoire, détail, contrôles", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.getByTestId("portfolio-table").getByRole("link", { name: /Menuiserie Blanchard/ }).click();
    await expect(page).toHaveURL(/\/daf\/c\/[0-9a-f-]{36}$/);
    companyId = page.url().split("/").pop()!;
    await page.getByRole("link", { name: "SIG", exact: true }).click();
    await expect(page.getByText(/aucun exercice n'est défini/)).toBeVisible();

    await page.goto(`/daf/c/${companyId}/data`);
    await page.getByLabel("Début").fill("2025-01-01");
    await page.getByLabel("Fin").fill("2025-12-31");
    await page.getByRole("button", { name: "Ajouter l'exercice" }).click();
    await expect(page.getByTestId("fiscal-years")).toContainText("Exercice 2025");
    await upload(page, companyId, "trial_balance", "02_BALANCE_2025_valide.csv", true);
    await upload(page, companyId, "fec", "01_FEC_2025_valide.txt");

    await page.goto(`/daf/c/${companyId}/sig`);
    await expect(page.getByTestId("sig-context")).toContainText("Provisoire");
    await expect(page.getByTestId("sig-context")).toContainText("PCG-2025");
    await expect(page.getByTestId("sig-RESULTAT_NET")).toHaveText("12 354,00 €");
    await expect(page.getByTestId("sig-EBE")).toHaveText("12 354,00 €");
    await expect(page.getByTestId("sig-reconciliation")).toContainText("écart 0.00 €");
    await page.locator('[data-row="PRODUCTION_VENDUE"] summary').click();
    await expect(page.getByTestId("contrib-706000")).toContainText("Règle PCG 706");
    await expect(page.getByTestId("contrib-706000")).toContainText("02_BALANCE_2025_valide.csv — ligne 5");
    await expect(page.getByTestId("sig-checks")).toContainText("Données N-1 indisponibles");
    await expect(page.getByTestId("sig-checks")).not.toContainText("Bloquant");

    // Source FEC choisie explicitement : justification exigée, puis écritures consultables.
    await page.getByLabel("Source").selectOption("fec");
    await page.getByRole("button", { name: "Calculer" }).click();
    await expect(page.getByTestId("sig-insufficient")).toContainText("Justifiez le choix de la source");
    await page.getByLabel("Justification du choix").fill("Contrôle sur les écritures");
    await page.getByRole("button", { name: "Calculer" }).click();
    await expect(page.getByTestId("sig-RESULTAT_NET")).toHaveText("12 354,00 €");
    await page.locator('[data-row="PRODUCTION_VENDUE"] summary').click();
    await page.getByTestId("contrib-706000").getByRole("link", { name: "12 écritures" }).click();
    await expect(page.getByTestId("account-entries").locator("tbody tr")).toHaveCount(12);
  });

  test("DAF : validation figée, publication soumise à la validation du référentiel", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.goto(`/daf/c/${companyId}/sig`);
    await page.getByTestId("sig-validate").click();
    await expect(page).toHaveURL(/\/sig\/v\/[0-9a-f-]{36}$/);
    snapshotUrl = page.url();
    await expect(page.getByTestId("snapshot-status")).toHaveText("Validé");
    await page.getByTestId("sig-publish").click();
    await expect(page.getByTestId("sig-form-status")).toContainText("n'a pas encore été validé par le cabinet");

    await page.goto("/daf/sig-rules");
    await expect(page.getByTestId("ruleset-PCG-2025")).toContainText("C-1");
    await page.getByTestId("approve-PCG-2025").click();
    await expect(page.getByTestId("ruleset-PCG-2025")).toContainText("Validé le");

    await page.goto(snapshotUrl);
    await page.getByTestId("sig-publish").click();
    // La page est réactualisée par le serveur : la version apparaît publiée.
    await expect(page.getByTestId("snapshot-status")).toHaveText("Publié");
  });

  test("client : voit la version publiée, sans détail interne ; un autre client n'y a pas accès", async ({ page, browser }) => {
    await login(page, USERS.artisan);
    await page.waitForURL(/\/client/);
    await page.goto(`/client/${companyId}/sig`);
    await expect(page.getByTestId("client-kpi-RESULTAT_NET")).toContainText("12 354,00 €");
    await expect(page.getByTestId("sig-table")).toBeVisible();
    await expect(page.locator("summary")).toHaveCount(0);
    await expect(page.getByText("Règle PCG 706")).toHaveCount(0);
    await page.goto(snapshotUrl);
    await expect(page).not.toHaveURL(/\/sig\/v\//);

    const other = await browser.newPage();
    await login(other, USERS.services);
    await other.waitForURL(/\/client/);
    const r = await other.goto(`/client/${companyId}/sig`);
    expect(r?.status()).toBe(404);
    await other.close();
  });
});
