import { test, expect } from "@playwright/test";

test.describe("Profile Page Flow", () => {
  let testUser: string;
  const testPassword = "testpassword123";

  test.beforeEach(async ({ page }) => {
    testUser = `testuser_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    // Register the user first to ensure they exist
    await page.goto("/auth");
    await page
      .getByRole("button", { name: /Нет аккаунта\? Зарегистрироваться/i })
      .click();
    await page.locator("#auth-username").fill(testUser);
    await page.locator("#auth-password").fill(testPassword);
    await page.getByRole("button", { name: "СОЗДАТЬ АККАУНТ" }).click();
    await page.getByRole("button", { name: "ВОЙТИ В СИСТЕМУ" }).click();
    await page.waitForURL(`**/user/${testUser}`);
  });

  test("should load profile successfully and show base elements", async ({
    page,
  }) => {
    // We are already on the user page after beforeEach

    // Check main elements
    // The username is usually in the profile header
    await expect(page.locator("text=" + testUser).first()).toBeVisible({
      timeout: 10000,
    });

    // We expect the 'История' (History) block to be visible
    await expect(
      page.locator("h2").filter({ hasText: "История" }),
    ).toBeVisible();

    // We expect 'Тут пока пусто.' since it's a new user without scrobbles
    await expect(page.getByText("Тут пока пусто.")).toBeVisible();
  });

  test("should load another user profile", async ({ page }) => {
    // Try to load a profile that might not exist
    await page.goto("/user/this_user_does_not_exist_123");
    await expect(page.locator("h1")).toHaveText("Профиль не найден", {
      timeout: 10000,
    });
  });
});
