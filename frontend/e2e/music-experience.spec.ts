import { test, expect } from "@playwright/test";
import { apiPost, scrobble, signUp } from "./helpers";

test("personal music search works at phone width and filters history", async ({
  page,
}) => {
  await signUp(page, "personalsearch");
  await scrobble(page.request, {
    title: "Personal track",
    artist: "Personal artist",
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/library/search");
  await page.getByLabel("Трек, артист или альбом").fill("Personal");
  await expect(
    page.getByRole("heading", { name: "История", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: "История", exact: true }),
      })
      .getByText("Personal artist — Personal track", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Трек, артист или альбом").fill("Does not exist");
  await expect(
    page.getByText("Нет прослушиваний по этим условиям."),
  ).toBeVisible();
});

test("guided connection progresses to a real live-event check", async ({
  page,
}) => {
  await signUp(page, "guidedconnection");
  await page.goto("/library/connect");
  await page.getByLabel("Музыкальный сервис").selectOption("extension");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Подключить по коду ↗" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Перейти к проверке" }).click();
  await expect(page.getByLabel("Источник для проверки")).toHaveValue(
    "extension",
  );
  await page.getByRole("button", { name: "Начать проверку" }).click();
  await scrobble(page.request, {
    title: "Guided track",
    artist: "Guided artist",
  });
  await expect(
    page.getByText("Событие получено: Guided artist — Guided track", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
});

test("history transfer previews a file and retries without duplicates", async ({
  page,
}) => {
  await signUp(page, "historytransfer");
  await page.goto("/library/transfer");
  await page.getByLabel("Файл истории").setInputFiles({
    name: "vein-history.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        scrobbles: [
          {
            title: "Transferred track",
            artist: "Transferred artist",
            played_at: "2024-01-02T10:00:00Z",
            duration: 180,
            listened_sec: 180,
            source: "spotify",
          },
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "Проверить файл" }).click();
  await expect(page.getByText("Новых: 1. Дублей: 0.")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByText(
      "Импорт завершён: 1 новых прослушиваний, 0 дублей пропущено.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Проверить файл" }).click();
  await expect(page.getByText("Новых: 0. Дублей: 1.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "История CSV" }).click();
  expect((await download).suggestedFilename()).toBe("veinmusic-history.csv");
});

test("calendar exposes a selected local-day history and date range", async ({
  page,
}) => {
  const username = await signUp(page, "calendarrange");
  const payload = {
    scrobbles: [
      {
        title: "Calendar range track",
        artist: "Calendar range artist",
        played_at: "2024-01-02T10:00:00Z",
        duration: 180,
        listened_sec: 180,
      },
    ],
  };
  const preview = await (
    await apiPost(page.request, "/api/account/history/preview", payload)
  ).json();
  const imported = await apiPost(page.request, "/api/account/history/import", {
    ...payload,
    preview_token: preview.preview_token,
  });
  expect(imported.ok()).toBe(true);
  await page.goto(`/user/${username}/stats`);
  await page
    .getByRole("combobox", { name: "Год календаря", exact: true })
    .selectOption("2024");
  await expect(
    page.getByRole("heading", { name: "История выбранного периода" }),
  ).toBeVisible();
  await expect(
    page.getByText("Calendar range artist — Calendar range track", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Конец периода").fill("2024-01-03");
  await expect(
    page.getByText("1 прослушиваний · 3 минут", { exact: true }),
  ).toBeVisible();
});

test("CSV with commas and quotes is parsed before import", async ({ page }) => {
  await signUp(page, "csvtransfer");
  await page.goto("/library/transfer");
  await page.getByLabel("Файл истории").setInputFiles({
    name: "vein-history.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'played_at,artist,title,duration,listened_sec,source,excluded_from_stats\r\n2024-01-01T12:00:00Z,"Artist, One","Song ""quoted""",180,180,spotify,True\r\n',
    ),
  });
  await page.getByRole("button", { name: "Проверить файл" }).click();
  await expect(
    page.getByText('Artist, One — Song "quoted"', { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить импорт" }).click();
  await expect(
    page.getByText(
      "Импорт завершён: 1 новых прослушиваний, 0 дублей пропущено.",
    ),
  ).toBeVisible();
});
