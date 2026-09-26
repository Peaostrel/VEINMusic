import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  const testUser = `testuser_${Date.now()}`;
  const testPassword = "testpassword123";

  test("should register a new user successfully", async ({ page }) => {
    await page.goto("/auth");

    // Switch to registration mode (retried: the first click can land
    // before the dev server has hydrated the page)
    await expect(async () => {
      await page.getByRole("tab", { name: "Регистрация" }).click();
      await expect(page.locator("h1")).toHaveText("Новый профиль", {
        timeout: 1000,
      });
    }).toPass();

    // Fill form
    await page.locator("#auth-username").fill(testUser);
    await page.locator("#auth-password").fill(testPassword);

    // Submit
    await page.getByRole("button", { name: "Создать аккаунт" }).click();

    // The API key is shown once, right after registration
    await expect(page.locator("h1")).toHaveText("Ваш API-ключ");
    await expect(page.getByText("Аккаунт создан")).toBeVisible();

    // Continue and verify redirect
    await page.getByRole("button", { name: "Я сохранил, дальше" }).click();
    await expect(page).toHaveURL(`/user/${testUser}`);
  });

  test("should show an error for a wrong password", async ({ page }) => {
    await page.goto("/auth");

    await expect(page.locator("h1")).toHaveText("С возвращением");

    await page.locator("#auth-username").fill("testuser");
    await page.locator("#auth-password").fill("wrongpassword");

    await page.getByRole("button", { name: "Войти", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible();
  });
});
