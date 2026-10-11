import { test, expect } from "@playwright/test";
import { API_URL, signUp, scrobble } from "./helpers";

test("library prioritizes search and keeps management in a keyboard-accessible menu", async ({
  page,
}, testInfo) => {
  await signUp(page, "designlibrary");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Моя библиотека" }),
  ).toBeVisible();
  await page
    .getByLabel("Поиск в моей музыке", { exact: true })
    .fill("My library track");
  await page.getByRole("button", { name: "Найти музыку" }).click();
  await expect(page).toHaveURL(/\/library\/search\?q=My\+library\+track/);
  await page.goto("/library");
  await page.getByText("Управление библиотекой", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: "Перенести историю", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await testInfo.attach("library-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("mobile playing details reserve footer space and show actual listening progress", async ({
  page,
}, testInfo) => {
  const username = await signUp(page, "designplaying");
  await scrobble(page.request, {
    title: "Mobile playing track",
    artist: "Mobile artist",
  });
  const track = await (
    await page.request.get(`${API_URL}/api/current-track/${username}`)
  ).json();
  const progress = Math.min(
    100,
    Math.round((track.listened_sec / track.duration) * 100),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/library");
  await page.getByLabel("Сейчас играет — подробности").click();
  const details = page.getByRole("region", {
    name: "Подробности прослушивания",
  });
  await expect(
    details.getByRole("progressbar", { name: "Прогресс прослушивания" }),
  ).toHaveAttribute("value", String(progress));
  await expect(details.getByText(`${progress}% · зачёт от 85%`)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number.parseFloat(
          document.documentElement.style.getPropertyValue("--playing-offset"),
        ),
      ),
    )
    .toBeGreaterThan(70);
  await testInfo.attach("playing-mobile", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("calendar switches between one month and annual overview", async ({
  page,
}, testInfo) => {
  const username = await signUp(page, "designcalendar");
  await page.goto(`/user/${username}/stats`);
  const calendar = page.getByRole("region", { name: "Музыкальный календарь" });
  await expect(
    calendar.getByRole("tab", { name: "Месяц", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(calendar.getByRole("heading", { level: 3 })).toHaveCount(1);
  await calendar.getByRole("tab", { name: "Весь год" }).click();
  await expect(calendar.getByRole("heading", { level: 3 })).toHaveCount(12);
  await calendar.getByRole("tab", { name: "Месяц", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await testInfo.attach("calendar-mobile", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await testInfo.attach("stats-desktop", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
