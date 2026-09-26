import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("Profile Page Flow", () => {
  let testUser: string;

  test.beforeEach(async ({ page }) => {
    testUser = await signUp(page, "testuser");
    await page.goto(`/user/${testUser}`);
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
