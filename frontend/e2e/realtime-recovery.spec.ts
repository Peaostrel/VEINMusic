import { test, expect, type WebSocketRoute } from "@playwright/test";
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
    await page.request.get(`${API_URL}/api/history/${username}`)
  ).json();
  const stats = await (
    await page.request.get(`${API_URL}/api/stats/${username}`)
  ).json();
  let history = {
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
  };
  let total = 1;
  await page.route(`**/api/history/${username}*`, (route) =>
    route.fulfill({ json: history }),
  );
  await page.route(`**/api/stats/${username}*`, (route) =>
    route.fulfill({ json: { ...stats, total_scrobbles: total } }),
  );
  await page.goto(`/user/${username}`);
  const section = page.getByRole("region", { name: "История", exact: true });
  await expect(section.getByText("нет связи", { exact: false })).toBeVisible();
  await expect(section.getByText("03:20", { exact: true })).toBeVisible();
  history = {
    ...history,
    history: [
      {
        ...history.history[0],
        title: "Reconciled track",
        listened_sec: 42,
        is_playing: false,
      },
    ],
  };
  total = 7;
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

test("room freezes after disconnect and resumes only after an authoritative snapshot", async ({
  page,
}) => {
  const username = await signUp(page, "roomrecovery");
  const sockets: WebSocketRoute[] = [];
  const state = (progress: number, playing: boolean) =>
    JSON.stringify({
      type: "ROOM_STATE",
      listeners: [username],
      host: username,
      you: username,
      chat_history: [],
      current_track: {
        title: "Room recovery track",
        artist: "Artist",
        duration: 200,
        progress_sec: progress,
        is_playing: playing,
        updated_at: Date.now() / 1000,
      },
    });
  await page.routeWebSocket("**/ws/together/recovery-room*", (socket) => {
    sockets.push(socket);
    if (sockets.length === 1) socket.send(state(10, true));
  });
  await page.goto("/together/recovery-room?name=Recovery");
  await expect(page.getByText("синхронно", { exact: true })).toBeVisible();
  const card = page.getByRole("region", { name: "Сейчас играет", exact: true });
  const elapsed = card.getByText(/^\d+:\d{2}$/).first();
  await expect(elapsed).toHaveText(/0:1\d/);
  await sockets[0].close({ code: 1012 });
  await expect.poll(() => sockets.length).toBe(2);
  await expect(page.getByText("подключение…", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Пауза" })).toBeDisabled();
  const frozen = await elapsed.textContent();
  await page.waitForTimeout(1200);
  await expect(elapsed).toHaveText(frozen!);
  sockets[1].send(state(40, false));
  await expect(page.getByText("синхронно", { exact: true })).toBeVisible();
  await expect(elapsed).toHaveText("0:40");
  await expect(card.getByRole("button", { name: "Играть" })).toBeEnabled();
});
