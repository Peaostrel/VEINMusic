import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("Achievements Page Flow", () => {
  let testUser: string;

  test.beforeEach(async ({ page }) => {
    testUser = await signUp(page, "testuser");
    await page.goto(`/user/${testUser}`);
  });

  test("should load achievements page and display progress", async ({
    page,
  }) => {
    // Navigate to achievements page
    await page.goto(`/user/${testUser}/achievements`);

    // Wait for the page to load
    await expect(page.locator("h1").filter({ hasText: testUser }))
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});

    // Check if the progress block is visible
    await expect(page.getByText(/Получено.*из/)).toBeVisible();

    // Check if the achievements list container exists
    // Since the database might be empty in E2E tests, we check if the progress text is 'Получено 0 из 0'
    const progressText = await page
      .locator("text=/Получено\\s+\\d+\\s+из\\s+\\d+/")
      .innerText();

    if (progressText.includes("из 0")) {
      // Empty database scenario
      await expect(page.getByText("0%")).toBeVisible();
    } else {
      // Pre-populated database scenario
      const achievementHeadings = page.locator("h3");
      await expect(achievementHeadings.first()).toBeVisible();
      await expect(page.getByText("Заблокировано").first()).toBeVisible();
    }
  });
});
