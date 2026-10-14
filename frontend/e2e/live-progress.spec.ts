import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test("now playing advances locally, reconciles tracks and waits for confirmed credit", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const username = await signUp(page, "liveprogress");
  let current = {
    playing: true,
    title: "First live track",
    artist: "Artist",
    source: "plat",
    duration: 100,
    listened_sec: 0,
    display_listened_sec: 0,
    playback_remaining_sec: 45,
  };
  await page.route(`**/api/current-track/${username}`, (route) =>
    route.fulfill({ json: current }),
  );
  await page.goto(`/user/${username}`);
  const card = page
    .getByRole("region", { name: "Сейчас играет", exact: true })
    .last();
  const progress = card.getByRole("progressbar", {
    name: "Прогресс прослушивания",
  });
  await expect(progress).toHaveAttribute("value", "0");
  await expect(progress).toHaveAttribute("value", "1");
  await expect(progress).toHaveAttribute("value", "2");
  current = { ...current, listened_sec: 80, display_listened_sec: 84 };
  await expect(
    card.getByText(/^(8[5-9]|9\d|100)% · зачёт от 85%$/),
  ).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("Прослушивание засчитано")).toHaveCount(0);
  current = { ...current, listened_sec: 85, display_listened_sec: 90 };
  await expect(card.getByText("Прослушивание засчитано")).toBeVisible({
    timeout: 15_000,
  });
  current = {
    ...current,
    title: "Second live track",
    listened_sec: 0,
    display_listened_sec: 0,
  };
  await expect(card.getByText("Second live track")).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(async () => Number(await progress.getAttribute("value")))
    .toBeLessThan(5);
  current = { ...current, playing: false };
  await expect(
    page.getByRole("progressbar", { name: "Прогресс прослушивания" }),
  ).toHaveCount(0, { timeout: 15_000 });
});

test("a missing heartbeat expires even when polling fails", async ({
  page,
}) => {
  const username = await signUp(page, "staleprogress");
  const time = new Date("2026-10-14T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  await page.route(`**/api/current-track/${username}`, (route) =>
    route.fulfill({
      json: {
        playing: true,
        title: "Stale track",
        artist: "Artist",
        duration: 100,
        listened_sec: 0,
        display_listened_sec: 0,
        playback_remaining_sec: 2,
      },
    }),
  );
  await page.goto(`/user/${username}`);
  await expect(
    page.getByRole("progressbar", { name: "Прогресс прослушивания" }).last(),
  ).toBeVisible();
  await page.route(`**/api/current-track/${username}`, (route) =>
    route.abort(),
  );
  await page.clock.runFor(3000);
  await expect(
    page.getByRole("progressbar", { name: "Прогресс прослушивания" }),
  ).toHaveCount(0);
});
