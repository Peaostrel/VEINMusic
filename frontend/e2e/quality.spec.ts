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
  await page.getByRole("button", { name: "Исключить", exact: true }).click();
  await expect(
    page.getByText("Прослушивание исключено. Его можно вернуть."),
  ).toBeVisible();
  await expect(
    page.locator("main").getByText("Quality track", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вернуть в статистику" }).click();
  await expect(
    page.getByText("Прослушивание вернулось в статистику."),
  ).toBeVisible();
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
  await page.route(`${API_URL}/api/recommendations/me`, (route) =>
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
