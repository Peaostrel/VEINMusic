import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("Settings", () => {
  test("saves the display name to the profile", async ({ page }) => {
    const username = await signUp(page, "settings");
    await page.goto("/settings");
    await expect(
      page.getByRole("navigation", { name: "Разделы настроек" }),
    ).toBeVisible();

    await page.getByLabel("Отображаемое Имя").fill("E2E Display Name");
    await page.getByRole("button", { name: "Сохранить всё" }).click();
    await expect(page.getByText("✅ Успешно!")).toBeVisible();

    await page.goto(`/user/${username}`);
    await expect(page.getByText("E2E Display Name").first()).toBeVisible();
  });

  test("switches tabs and marks the active one", async ({ page }) => {
    await signUp(page, "tabs");
    await page.goto("/settings");
    const privacy = page.getByRole("button", { name: "Приватность" });
    await privacy.click();
    await expect(privacy).toHaveAttribute("aria-current", "page");
    const toggle = page.getByRole("switch", { name: "Приватный профиль" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("connects ListenBrainz export and validates webhook URLs", async ({
    page,
  }) => {
    await signUp(page, "export");
    await page.goto("/settings");
    await page.getByRole("button", { name: "Экспорт и вебхуки" }).click();
    await expect(
      page.getByRole("heading", { name: "Экспорт прослушиваний" }),
    ).toBeVisible();

    await page.getByLabel("Токен ListenBrainz").fill("lb-token-123");
    await page.getByRole("button", { name: "Подключить ListenBrainz" }).click();
    await expect(page.getByRole("status")).toContainText("ListenBrainz");
    await expect(page.getByText("Подключено", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Отправлять прослушивания")).toBeVisible();

    // Private addresses are refused by the server
    await page.getByLabel("Адрес вебхука").fill("http://127.0.0.1/hook");
    await page.getByRole("button", { name: "Добавить вебхук" }).click();
    await expect(page.getByRole("status")).toContainText("публичным");
    await expect(page.getByText("Вебхуков пока нет.")).toBeVisible();
  });

  test("shows the Last.fm connect result from the redirect", async ({
    page,
  }) => {
    await signUp(page, "lfm");
    await page.goto("/settings?tab=export&status=lastfm_connected");
    await expect(
      page.getByRole("button", { name: "Экспорт и вебхуки" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("✅ Last.fm подключён")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Подключить Last.fm" }),
    ).toHaveAttribute("href", /\/api\/integrations\/lastfm\/connect$/);
  });
});
