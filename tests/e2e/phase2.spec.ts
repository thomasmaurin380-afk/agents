import { expect, test, type Page } from "@playwright/test";
import { login, loginStaff, USERS } from "./helpers";

const DEMO = "demo-files";

async function openServicesCompany(page: Page) {
  await loginStaff(page, USERS.admin);
  await page.getByTestId("portfolio-table").getByRole("link", { name: "Atelier Numérique" }).click();
  await expect(page).toHaveURL(/\/daf\/c\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

async function upload(page: Page, companyId: string, kind: string, file: string) {
  await page.goto(`/daf/c/${companyId}/imports/new`);
  await page.getByLabel("Type de données").selectOption(kind);
  await page.getByLabel(/Fichier \(20 Mo/).setInputFiles(`${DEMO}/${file}`);
  await page.getByRole("button", { name: "Téléverser et analyser" }).click();
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/);
}

async function validate(page: Page) {
  await page.getByRole("button", { name: "Valider et enregistrer l'import" }).click();
  await expect(page.getByTestId("import-report")).toBeVisible();
  await expect(page.getByTestId("import-status")).toHaveText("Enregistré");
}

test.describe.serial("Phase 2 — imports comptables et bancaires", () => {
  let companyId = "";

  test("paramétrage : exercice 2025 et compte bancaire", async ({ page }) => {
    companyId = await openServicesCompany(page);
    await page.getByRole("link", { name: "Données comptables" }).click();
    await expect(page.getByRole("heading", { name: "Données comptables et bancaires" })).toBeVisible();
    await page.getByLabel("Début").fill("2025-01-01");
    await page.getByLabel("Fin").fill("2025-12-31");
    await page.getByRole("button", { name: "Ajouter l'exercice" }).click();
    await expect(page.getByTestId("fiscal-years")).toContainText("Exercice 2025");
    // Chevauchement refusé, saisie conservée.
    await page.getByLabel("Début").fill("2025-06-01");
    await page.getByLabel("Fin").fill("2026-05-31");
    await page.getByRole("button", { name: "Ajouter l'exercice" }).click();
    await expect(page.getByText("Cet exercice chevauche un exercice existant.")).toBeVisible();
    await page.getByLabel("Banque", { exact: true }).fill("Banque Démo");
    await page.getByLabel("Nom du compte").fill("Compte courant");
    await page.getByLabel(/4 derniers caractères/).fill("7890");
    await page.getByRole("button", { name: "Ajouter le compte" }).click();
    await expect(page.getByTestId("bank-accounts")).toContainText("…7890");
  });

  test("balance CSV (Windows-1252, lignes de titre) : correspondance proposée, contrôles, enregistrement", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await upload(page, companyId, "trial_balance", "atelier-numerique-balance-2025-12-31.csv");
    const summary = page.getByTestId("import-summary");
    await expect(summary).toContainText("Lignes de comptes");
    await expect(summary).toContainText("20");
    await expect(page.getByTestId("issue-list")).toContainText("Ligne sans numéro de compte ignorée");
    await expect(page.getByLabel("Ligne d'en-tête (n° de ligne du fichier)")).toHaveValue("4");
    await expect(page.getByTestId("normalized-preview")).toContainText("Capital social");
    await validate(page);
    await expect(page.getByTestId("import-summary")).toContainText("Comptes à vérifier");
  });

  test("le même fichier ne peut pas être importé deux fois", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.goto(`/daf/c/${companyId}/imports/new`);
    await page.getByLabel("Type de données").selectOption("trial_balance");
    await page.getByLabel(/Fichier \(20 Mo/).setInputFiles(`${DEMO}/atelier-numerique-balance-2025-12-31.csv`);
    await page.getByRole("button", { name: "Téléverser et analyser" }).click();
    await expect(page.getByText(/Ce fichier a déjà été importé/)).toBeVisible();
  });

  test("FEC : format normé, écritures enregistrées", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await upload(page, companyId, "fec", "atelier-numerique-FEC-2025.txt");
    await expect(page.getByText(/Format FEC normé/)).toBeVisible();
    await expect(page.getByTestId("import-summary")).toContainText("Écritures");
    await expect(page.getByTestId("issue-list")).toContainText("Nom de fichier non conforme");
    await validate(page);
  });

  test("relevé CSV enregistré, puis relevé XLSX du 1er semestre entièrement reconnu comme doublon", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await upload(page, companyId, "bank_transactions", "atelier-numerique-releve-2025.csv");
    await expect(page.getByTestId("import-summary")).toContainText("cohérent");
    await validate(page);

    await upload(page, companyId, "bank_transactions", "atelier-numerique-releve-S1-2025.xlsx");
    await expect(page.getByTestId("issue-list")).toContainText("Toutes les opérations de ce fichier sont déjà enregistrées");
    await validate(page);
    await expect(page.getByTestId("import-summary")).toContainText("Doublons ignorés");

    await page.goto(`/daf/c/${companyId}/data`);
    await expect(page.getByTestId("bank-accounts")).toContainText("133 opération(s)");
  });

  test("plan de comptes : comptes rattachés automatiquement au PCG", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.goto(`/daf/c/${companyId}/accounts`);
    const table = page.getByTestId("accounts-table");
    await expect(table).toContainText("411000");
    await expect(table.getByText("Automatique validé").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /À vérifier \(0\)/ })).toBeVisible();
  });

  test("indicateurs : sources présentes, aucune valeur inventée ; même état côté dirigeant", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.goto(`/daf/c/${companyId}`);
    const cards = page.getByTestId("indicator-insufficient");
    await expect(cards.filter({ hasText: "Chiffre d'affaires HT" })).toContainText("Calcul disponible en phase 4");
    await expect(cards.filter({ hasText: "Écart au budget" })).toContainText("Source manquante : Budget");
    await expect(page.getByText("€")).toHaveCount(0);

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await login(page, USERS.services);
    await expect(page).toHaveURL(new RegExp(`/client/${companyId}$`));
    const clientCards = page.getByTestId("indicator-insufficient");
    await expect(clientCards.filter({ hasText: "Trésorerie disponible" })).toContainText("Calcul disponible en phase 4");
    await expect(page.getByText("€")).toHaveCount(0);
    // Le dirigeant n'accède pas aux imports.
    await page.goto(`/daf/c/${companyId}/data`);
    await expect(page).toHaveURL(/\/client/);
  });

  test("suppression définitive d'un import enregistré : confirmation SUPPRIMER, sources mises à jour", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.goto(`/daf/c/${companyId}/data`);
    await expect(page.getByTestId("data-sources")).toContainText("FEC");
    await page.getByRole("link", { name: "Supprimer l'import atelier-numerique-FEC-2025.txt" }).click();
    const dialog = page.getByTestId("delete-import-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Atelier Numérique");
    await expect(page.getByTestId("delete-volumes")).toContainText("lignes d'écritures du FEC");
    const submit = dialog.getByRole("button", { name: "Supprimer définitivement" });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel(/Pour confirmer, saisissez/).fill("SUPPRIMER");
    await submit.click();
    await expect(page.getByTestId("deletion-success")).toContainText("atelier-numerique-FEC-2025.txt");
    await expect(page.getByTestId("imports-table")).not.toContainText("atelier-numerique-FEC-2025.txt");
    // La balance reste disponible ; le FEC ne l'est plus.
    await expect(page.getByTestId("data-sources").locator("li", { hasText: "FEC" }).getByLabel("Manquante")).toBeVisible();
    await expect(page.getByTestId("data-sources").locator("li", { hasText: "Balance comptable courante" }).getByLabel("Disponible")).toBeVisible();
  });

  test("un collaborateur DAF ne voit pas l'action de suppression", async ({ page }) => {
    await loginStaff(page, USERS.analyst);
    await page.goto(`/daf/c/${companyId}/data`);
    await expect(page.getByTestId("imports-table")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Supprimer l'import/ })).toHaveCount(0);
  });
});

