import { test, expect } from "@playwright/test";
import { API_URL, scrobble, signUp } from "./helpers";

test("history exclusion can be restored without deleting the play", async ({
  page,
}) => {
  await signUp(page, "historyquality");
  await scrobble(page.request, {
    title: "Quality track",
    artist: "Quality artist",
  });
  await page.goto("/library/cleanup");
  await expect(
    page.getByRole("heading", { name: "Порядок в истории" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Выбрать Quality track", exact: true })
    .check();
  await page.getByRole("button", { name: "Предварительный просмотр" }).click();
  await expect(
    page.getByText("Будет изменено записей: 1. Отмена — в течение 24 часов."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Применить к 1 записям" }).click();
  await expect(
    page.getByText("Исключено из статистики", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Отменить изменение" }).click();
  await expect(page.getByText("Изменение отменено.")).toBeVisible();
});

test("discovery feedback and a downloadable weekly card", async ({ page }) => {
  await signUp(page, "discoveryquality");
  await scrobble(page.request, {
    title: "Discovery track",
    artist: "Discovery artist",
  });
  const history = await (
    await page.request.get(`${API_URL}/api/me/scrobbles/manage`)
  ).json();
  const id = history[0].track.id as number;
  let hidden = false;
  await page.route(`${API_URL}/api/recommendations/me**`, (route) =>
    route.fulfill({
      json: {
        recommendations: hidden
          ? []
          : [
              {
                id,
                title: "Discovery track",
                artist: "Discovery artist",
                reason: "Популярно в сообществе VEIN",
              },
            ],
      },
    }),
  );
  await page.goto("/library/discover");
  await expect(
    page.getByRole("heading", { name: "Открытия и ваш вкус" }),
  ).toBeVisible();
  hidden = true;
  await page.getByRole("button", { name: "Не нравится", exact: true }).click();
  await expect(page.getByText("Учли ваш выбор в подборке.")).toBeVisible();
  await expect(
    page.getByText("Пока нет новых рекомендаций", { exact: true }),
  ).toBeVisible();
  hidden = false;
  await page.getByRole("button", { name: "Отменить последний выбор" }).click();
  await expect(
    page.getByRole("button", { name: "Не нравится", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать карточку PNG" }).click();
  expect((await download).suggestedFilename()).toBe("vein-week.png");
});

test("connection check waits for a new live event", async ({ page }) => {
  await signUp(page, "connectionquality");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Интеграции", exact: true }).click();
  await page.getByLabel("Источник для проверки").selectOption("extension");
  await page.getByRole("button", { name: "Начать проверку" }).click();
  await scrobble(page.request, {
    title: "Connection track",
    artist: "Connection artist",
  });
  await expect(
    page.getByText("Событие получено: Connection artist — Connection track", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Остановить", exact: true }).click();
});

test("saved music and notes stay in the private listen-later list", async ({
  page,
}) => {
  await signUp(page, "laterquality");
  await scrobble(page.request, {
    title: "Later track",
    artist: "Later artist",
  });
  const history = await (
    await page.request.get(`${API_URL}/api/me/scrobbles/manage`)
  ).json();
  const id = history[0].track.id as number;
  await page.route(`${API_URL}/api/recommendations/me**`, (route) =>
    route.fulfill({
      json: {
        recommendations: [
          {
            id,
            title: "Later track",
            artist: "Later artist",
            reason: "Для вас",
          },
        ],
      },
    }),
  );
  await page.goto("/library/discover");
  await page
    .getByRole("button", { name: "Послушать позже", exact: true })
    .click();
  await expect(
    page.getByText("В списке на потом", { exact: true }),
  ).toBeVisible();
  await page.goto("/library/later");
  await expect(
    page.getByRole("link", { name: "Later artist — Later track" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("Моя заметка"));
  await page.getByRole("button", { name: "Заметка", exact: true }).click();
  await expect(page.getByText("Моя заметка", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Убрать из списка" }).click();
  await expect(
    page.getByText("Сохраните музыку из рекомендаций или карточки трека."),
  ).toBeVisible();
});
