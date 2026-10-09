import { expect, test } from "@playwright/test";
import { login, loginStaff, USERS } from "./helpers";

const COMPANY = {
  services: "Atelier Numérique",
  commerce: "Maison Verdier",
  artisan: "Menuiserie Blanchard EURL (démo)",
};

test.describe.serial("Phase 1 — fondations", () => {
  let servicesUrl = "";
  let artisanUrl = "";

  test("un visiteur non connecté est renvoyé vers la connexion", async ({ page }) => {
    for (const path of ["/daf/portfolio", "/client", "/mfa/setup"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("identifiants incorrects : message générique", async ({ page }) => {
    await login(page, USERS.admin, "MauvaisMotDePasse1");
    await expect(page.getByText("Identifiants incorrects.")).toBeVisible();
  });

  test("DAF administrateur : 2FA obligatoire puis portefeuille complet", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await expect(page.getByRole("heading", { name: "Portefeuille clients" })).toBeVisible();
    const table = page.getByTestId("portfolio-table");
    for (const name of Object.values(COMPANY)) await expect(table.getByText(name, { exact: true })).toBeVisible();
    servicesUrl = (await table.getByRole("link", { name: COMPANY.services }).getAttribute("href"))!;
    artisanUrl = (await table.getByRole("link", { name: COMPANY.artisan }).getAttribute("href"))!;
    expect(servicesUrl).toMatch(/^\/daf\/c\/[0-9a-f-]{36}$/);
  });

  test("fiche entreprise : identité, équipe, et « Données insuffisantes » sans valeur inventée", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.goto(servicesUrl);
    await expect(page.getByRole("heading", { name: COMPANY.services })).toBeVisible();
    const cards = page.getByTestId("indicator-insufficient");
    await expect(cards).toHaveCount(6);
    await expect(cards.first()).toContainText("Données insuffisantes");
    await expect(cards.first()).toContainText("Source manquante : Balance comptable");
    await expect(page.getByText("€")).toHaveCount(0);
    await expect(page.getByTestId("client-members")).toContainText("Hugo Lefèvre (démo)");
  });

  test("création d'une entreprise par l'administrateur", async ({ page }) => {
    await loginStaff(page, USERS.admin);
    await page.getByRole("link", { name: "Nouvelle entreprise" }).click();
    await page.getByLabel("Raison sociale *").fill("Boulangerie Test E2E (démo)");
    await page.getByLabel("SIREN").fill("123456789");
    await page.getByRole("button", { name: "Créer l'entreprise" }).click();
    await expect(page.getByText("SIREN invalide")).toBeVisible();
    // La saisie est conservée après une erreur de validation.
    await expect(page.getByLabel("Raison sociale *")).toHaveValue("Boulangerie Test E2E (démo)");
    await page.getByLabel("SIREN").fill("");
    await page.getByLabel("Mois d'ouverture de l'exercice").selectOption("4");
    await page.getByRole("button", { name: "Créer l'entreprise" }).click();
    await expect(page).toHaveURL(/\/daf\/c\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Exercice décalé (1er avril → 31 mars)")).toBeVisible();
  });

  test("invitation d'un dirigeant puis acceptation : accès à son seul portail", async ({ page, browser }) => {
    await loginStaff(page, USERS.admin);
    await page.goto(servicesUrl);
    await page.getByLabel("E-mail du dirigeant ou collaborateur").fill("associe.services@demo.invalid");
    await page.getByLabel("Rôle").selectOption("client_member");
    await page.getByRole("button", { name: "Créer l'invitation" }).click();
    const link = (await page.getByTestId("invitation-link").locator("code").textContent())!.trim();
    expect(link).toMatch(/\/invitation\/[A-Za-z0-9_-]{43}$/);

    const ctx = await browser.newContext();
    const guest = await ctx.newPage();
    await guest.goto(new URL(link).pathname);
    await expect(guest.getByText(COMPANY.services)).toBeVisible();
    await guest.getByLabel("Prénom et nom").fill("Associé Services (démo)");
    await guest.getByLabel("Mot de passe").fill("trop-court");
    await guest.getByRole("button", { name: "Créer mon compte et accepter" }).click();
    await expect(guest.getByText("12 caractères minimum").first()).toBeVisible();
    await guest.getByLabel("Mot de passe").fill("NouveauCompte-2026");
    await guest.getByRole("button", { name: "Créer mon compte et accepter" }).click();
    await expect(guest).toHaveURL(/\/client\/[0-9a-f-]{36}$/);
    await expect(guest.getByRole("heading", { name: COMPANY.services })).toBeVisible();

    // Lien consommé : inutilisable une seconde fois.
    await guest.goto(new URL(link).pathname);
    await expect(guest.getByText("Cette invitation a déjà été utilisée.")).toBeVisible();
    await ctx.close();
  });

  test("dirigeant : son portail uniquement, cohérent avec l'espace DAF", async ({ page }) => {
    await login(page, USERS.services);
    await expect(page).toHaveURL(/\/client\/[0-9a-f-]{36}$/);
    const companyId = page.url().split("/").pop()!;
    expect(servicesUrl.endsWith(companyId)).toBe(true);
    await expect(page.getByRole("heading", { name: COMPANY.services })).toBeVisible();
    await expect(page.getByTestId("lead-advisor")).toHaveText("Léa Dubois (démo)");
    await expect(page.getByTestId("indicator-insufficient")).toHaveCount(6);
    await expect(page.getByText("€")).toHaveCount(0);

    // Espace DAF interdit → renvoyé vers son portail.
    await page.goto("/daf/portfolio");
    await expect(page).toHaveURL(/\/client/);
    // Autre entreprise : 404 (on ne révèle pas son existence).
    const artisanId = artisanUrl.split("/").pop()!;
    const res = await page.goto(`/client/${artisanId}`);
    expect(res?.status()).toBe(404);
    const res2 = await page.goto(`/daf/c/${artisanId}`);
    expect(page.url()).toMatch(/\/client/);
    expect(res2?.ok()).toBe(true);
  });

  test("collaborateur DAF : uniquement les entreprises affectées", async ({ page }) => {
    await loginStaff(page, USERS.analyst);
    const table = page.getByTestId("portfolio-table");
    await expect(table.getByText(COMPANY.services, { exact: true })).toBeVisible();
    await expect(table.getByText(COMPANY.commerce, { exact: true })).toBeVisible();
    await expect(table.getByText(COMPANY.artisan, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Nouvelle entreprise" })).toHaveCount(0);
    const res = await page.goto(artisanUrl);
    expect(res?.status()).toBe(404);
    const team = await page.goto("/daf/team");
    expect(team?.status()).toBe(404);
  });

  test("déconnexion", async ({ page }) => {
    await login(page, USERS.commerce);
    await expect(page).toHaveURL(/\/client\//);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/client");
    await expect(page).toHaveURL(/\/login$/);
  });
});
