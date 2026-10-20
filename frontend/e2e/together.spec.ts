import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("Listen Together", () => {
  test("creates a room from the lobby", async ({ page }) => {
    await signUp(page, "dj");
    await page.goto("/together");
    await expect(
      page.getByRole("heading", { name: "Слушать вместе", level: 1 }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Создать комнату" }).click();
    const dialog = page.getByRole("dialog", { name: "Новая комната" });
    await expect(dialog).toBeVisible();

    // Escape closes the dialog
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Создать комнату" }).click();
    await dialog.getByLabel("Название комнаты").fill("E2E Room");
    await dialog.getByRole("button", { name: "Создать и стать DJ" }).click();
    await page.waitForURL(/\/together\/room-/);
    await expect(page.getByRole("heading", { name: "E2E Room" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Перемотка" })).toBeVisible();

    const settings = page.getByRole("region", { name: "Настройки комнаты" });
    await settings.getByLabel("Название комнаты").fill("Private E2E Room");
    await settings.getByLabel("Приватная").check();
    await settings.getByRole("button", { name: "Сохранить" }).click();
    await expect(
      page.getByRole("heading", { name: "Private E2E Room" }),
    ).toBeVisible();
    await expect(page.getByText("доступ по ссылке", { exact: false })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await settings.getByRole("button", { name: "Удалить" }).click();
    await page.waitForURL(/\/together$/);
  });
});
