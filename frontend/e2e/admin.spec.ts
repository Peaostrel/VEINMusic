import { test, expect, type Page } from "@playwright/test";
import { setRole, signUp } from "./helpers";

async function openAdmin(page: Page) {
  const username = await signUp(page, "admin");
  setRole(username, "admin");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: /VEIN Admin Nexus/ }),
  ).toBeVisible();
  return username;
}

async function openTab(page: Page, name: RegExp | string) {
  const tab = page.getByRole("button", { name });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
}

test.describe("Admin panel", () => {
  test("is closed to regular users", async ({ page }) => {
    await signUp(page, "regular");
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Доступ ограничен" }),
    ).toBeVisible();
  });

  test("opens for an admin and switches tabs", async ({ page }) => {
    const username = await openAdmin(page);
    await expect(
      page.getByRole("heading", { name: "Динамика (UTC)" }),
    ).toBeVisible();

    await openTab(page, /Пользователи/);
    await expect(page.getByText(`@${username}`).first()).toBeVisible();

    // The user menu links to the panel for staff
    await page.getByRole("button", { name: "Меню аккаунта" }).click();
    await expect(page.getByRole("link", { name: "Админка" })).toBeVisible();
  });

  test("user card changes a level and the change is audited", async ({
    page,
  }) => {
    await openAdmin(page);
    await openTab(page, /Пользователи/);
    const first = page.getByRole("button", { name: /^Карточка @/ }).first();
    await first.click();
    const card = page.getByRole("dialog", { name: /Пользователь @/ });
    await expect(card.getByText("Последние прослушивания")).toBeVisible();

    await card.getByLabel("Уровень").fill("7");
    await card.getByRole("button", { name: "Установить уровень" }).click();
    await expect(card.getByText("✅ Уровень 7 установлен")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();

    await openTab(page, "Журнал");
    await expect(page.getByRole("cell", { name: "user.level" })).toBeVisible();
    await expect(page.getByText("level: 7")).toBeVisible();
  });

  test("system, moderation and catalog tabs load", async ({ page }) => {
    await openAdmin(page);
    await openTab(page, "Система");
    await expect(page.getByText("Redis / воркер")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Импорт из Last.fm" }),
    ).toBeVisible();

    await openTab(page, "Модерация");
    await expect(
      page.getByRole("heading", { name: "Модерация комментариев" }),
    ).toBeVisible();

    await openTab(page, /Каталог/);
    await expect(page.getByLabel("Поиск по каталогу")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Чёрный список/ }),
    ).toBeVisible();
  });

  test("broadcast reaches the listed user's notifications", async ({
    page,
    browser,
  }) => {
    const other = await browser.newContext();
    const listenerPage = await other.newPage();
    const listener = await signUp(listenerPage, "listener");

    await openAdmin(page);
    await openTab(page, /Оповещения/);
    await page.getByLabel(/^Текст/).fill("Плановые работы в 03:00");
    await page.getByLabel(/^Кому/).fill(listener);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText(/Получателей: 1/)).toBeVisible();

    await listenerPage.goto("/");
    await listenerPage
      .getByRole("button", { name: /Уведомления: 1 непрочитанных/ })
      .click();
    await expect(
      listenerPage.getByText("Плановые работы в 03:00"),
    ).toBeVisible();
    await other.close();
  });
});
