import { test, expect } from "@playwright/test";
import { setRole, signUp } from "./helpers";

test.describe("Admin panel", () => {
  test("is closed to regular users", async ({ page }) => {
    await signUp(page, "regular");
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Доступ ограничен" }),
    ).toBeVisible();
  });

  test("opens for an admin and switches tabs", async ({ page }) => {
    const username = await signUp(page, "admin");
    setRole(username, "admin");
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /VEIN Admin Nexus/ }),
    ).toBeVisible();

    const usersTab = page.getByRole("button", { name: /Пользователи/ });
    await usersTab.click();
    await expect(usersTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(`@${username}`).first()).toBeVisible();

    // The user menu links to the panel for staff
    await page.getByRole("button", { name: "Меню аккаунта" }).click();
    await expect(page.getByRole("link", { name: "Админка" })).toBeVisible();
  });
});
