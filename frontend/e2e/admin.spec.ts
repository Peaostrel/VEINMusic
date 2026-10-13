import { test, expect, type Page } from "@playwright/test";
import { setRole, signUp } from "./helpers";

async function openAdmin(page: Page) {
  const username = await signUp(page, "admin");
  setRole(username, "admin");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Админка", level: 1 }),
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
    await expect(card.getByText("Уровень 7 установлен")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();

    await openTab(page, "Журнал");
    // Newest first; earlier runs against the same database may have more
    await expect(
      page.getByRole("cell", { name: "user.level" }).first(),
    ).toBeVisible();
    await expect(page.getByText("level: 7").first()).toBeVisible();
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

  test("reports, scrobbles, integrations and logs tabs load", async ({
    page,
  }) => {
    await openAdmin(page);
    await openTab(page, /^Жалобы/);
    await expect(page.getByText("Жалобы пользователей")).toBeVisible();
    await openTab(page, "Прослушивания");
    await expect(page.getByText("Массовое удаление")).toBeVisible();
    await openTab(page, "Интеграции");
    await expect(page.getByText("Подключённые сервисы")).toBeVisible();
    await openTab(page, "Логи");
    await expect(page.getByText("Ошибки и предупреждения")).toBeVisible();
  });
});

test("admin MFA refusal explains how to restore access", async ({ page }) => {
  await signUp(page, "mfa_admin");
  await page.route("**/api/admin/stats", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        detail:
          "Для доступа администратора включите двухфакторную защиту в настройках безопасности",
      }),
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByText(
      "Для доступа администратора включите двухфакторную защиту в настройках безопасности",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Включить двухфакторную защиту" }),
  ).toHaveAttribute("href", "/settings?tab=security");
});

test("admin server failure can be retried without being called a permission denial", async ({
  page,
}) => {
  const username = await signUp(page, "retry_admin");
  setRole(username, "admin");
  await page.route("**/api/admin/stats", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Сервис временно недоступен" }),
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Не удалось загрузить админку" }),
  ).toBeVisible();
  await page.unroute("**/api/admin/stats");
  await page.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(
    page.getByRole("heading", { name: "Админка", exact: true }),
  ).toBeVisible();
});

test("optional admin request network failure does not block the panel", async ({
  page,
}) => {
  const username = await signUp(page, "partial_admin");
  setRole(username, "admin");
  await page.route("**/api/admin/system/health", (route) => route.abort());
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Админка", exact: true }),
  ).toBeVisible();
});

test("security tab blocks an address for a while and lifts the block", async ({
  page,
}) => {
  await openAdmin(page);
  await openTab(page, "Безопасность");
  await expect(page.getByText("Отказы за сутки")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Неудачные входы" }),
  ).toBeVisible();

  // A public address nobody in the test run uses (earlier runs may share the database)
  const address = `9.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  await page.getByLabel("Адрес или подсеть").fill(address);
  await page.getByLabel("Срок").selectOption({ label: "1 час" });
  await page.getByLabel("Причина").fill("E2E");
  await page
    .getByRole("button", { name: "Заблокировать", exact: true })
    .click();
  await expect(page.getByText(`${address} заблокирован`)).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: `${address}/32` });
  await expect(row).toContainText("E2E");

  await row.getByRole("button", { name: "Снять" }).click();
  await expect(page.getByText(`${address}/32 разблокирован`)).toBeVisible();
  await expect(row).toBeHidden();

  // Internal addresses can't be blocked: that would cut off the site itself
  await page.getByLabel("Адрес или подсеть").fill("10.0.0.0/8");
  await page
    .getByRole("button", { name: "Заблокировать", exact: true })
    .click();
  await expect(
    page.getByText("Внутренние адреса блокировать нельзя"),
  ).toBeVisible();
});
