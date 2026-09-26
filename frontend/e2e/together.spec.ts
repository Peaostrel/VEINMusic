import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("Listen Together", () => {
  test("creates a room from the lobby", async ({ page }) => {
    await signUp(page, "dj");
    await page.goto("/together");
    await expect(
      page.getByRole("heading", { name: "СЛУШАТЬ ВМЕСТЕ" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Создать комнату" }).click();
    const dialog = page.getByRole("dialog", { name: "Создание комнаты" });
    await expect(dialog).toBeVisible();

    // Escape closes the dialog
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Создать комнату" }).click();
    await dialog.getByLabel("Название комнаты").fill("E2E Room");
    await dialog.getByRole("button", { name: "Войти как DJ" }).click();
    await page.waitForURL(/\/together\/room-/);
    await expect(page.getByRole("heading", { name: "E2E Room" })).toBeVisible();
  });
});
