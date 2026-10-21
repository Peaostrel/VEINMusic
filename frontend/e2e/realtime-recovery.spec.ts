import { test, expect } from "@playwright/test";
import { API_URL, scrobble, signUp } from "./helpers";

// Worker-owned API requests bypass page routes. These tests mock API snapshots;
// offline caching itself is covered separately with the worker enabled.
test.use({ serviceWorkers: "block" });

test("history caps stale playback and reconciles history and counters without navigation", async ({
  page,
}) => {
  test.setTimeout(45_000);
  const username = await signUp(page, "historyrecovery");
  await scrobble(page.request, {
    title: "Recovery track",
    artist: "Recovery artist",
  });
  const response = await (
    await page.request.get(`${API_URL}/api/profile/${username}/snapshot`)
  ).json();
  let snapshot = {
    ...response,
    history: [
      {
        ...response.history[0],
        duration: 200,
        listened_sec: 190,
        updated_at: new Date(Date.now() - 60_000).toISOString(),
        is_playing: true,
      },
    ],
    stats: { ...response.stats, total_scrobbles: 1 },
  };
  await page.route(`**/api/profile/${username}/snapshot*`, (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.goto(`/user/${username}`);
  const section = page.getByRole("region", { name: "История", exact: true });
  await expect(section.getByText("нет связи", { exact: false })).toBeVisible();
  await expect(section.getByText("03:20", { exact: true })).toBeVisible();
  snapshot = {
    ...snapshot,
    history: [
      {
        ...snapshot.history[0],
        title: "Reconciled track",
        listened_sec: 42,
        is_playing: false,
      },
    ],
    stats: { ...snapshot.stats, total_scrobbles: 7 },
  };
  // Simulate connectivity recovery; the profile reconciles its snapshot
  // immediately instead of waiting for the 60-second safety interval.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    section.getByText("Reconciled track", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(section.getByText("00:42", { exact: true })).toBeVisible();
  const counter = page
    .locator("dl > div")
    .filter({ has: page.getByText("прослушиваний", { exact: true }) });
  await expect(counter).toContainText("7");
});

test("statistics refresh in place while retaining the selected period", async ({
  page,
}) => {
  test.setTimeout(50_000);
  const username = await signUp(page, "statsrecovery");
  const original = await (
    await page.request.get(
      `${API_URL}/api/detailed-stats/${username}?period=all`,
    )
  ).json();
  let total = 3;
  await page.route(`**/api/detailed-stats/${username}?*`, (route) =>
    route.fulfill({ json: { ...original, total_scrobbles: total } }),
  );
  await page.goto(`/user/${username}/stats`);
  const counter = page
    .locator("dl > div")
    .filter({ has: page.getByText("Прослушиваний", { exact: true }) });
  await expect(counter).toContainText("3");
  total = 9;
  await expect(counter).toContainText("9", { timeout: 35_000 });
  await expect(page).toHaveURL(new RegExp(`/user/${username}/stats$`));
});
