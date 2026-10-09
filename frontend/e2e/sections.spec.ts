import { test, expect } from "@playwright/test";
import { API_URL, scrobble, signUp, uniqueName } from "./helpers";

/** Smoke tests for the sections added after the redesign: each page opens
 * and shows its data. */

test.describe("Feed, top and goals", () => {
  test("home shows the feed and the goals card", async ({ page }) => {
    await signUp(page, "home");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Лента" })).toBeVisible({
      timeout: 15000,
    });
    const goals = page.locator("section[aria-labelledby=goals-title]");
    await expect(goals.getByRole("heading", { name: "Цели" })).toBeVisible();
    await expect(
      goals.getByRole("link", { name: /Поставить цель/ }),
    ).toBeVisible();
  });

  test("the whole feed and the leaderboard open", async ({ page }) => {
    await signUp(page, "lists");
    await page.goto("/feed");
    await expect(page.getByRole("heading", { name: "Вся лента" })).toBeVisible({
      timeout: 15000,
    });
    await page.goto("/leaderboard");
    await expect(
      page.getByRole("heading", { name: "Топ слушателей" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("a goal created on the goals page shows on the home page", async ({
    page,
  }) => {
    await signUp(page, "goals");
    await page.goto("/goals");
    await expect(
      page.getByRole("heading", { name: "Музыкальные цели" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Целей пока нет")).toBeVisible();
    await page.getByLabel("Целевое значение").fill("25");
    await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Цели сохранены")).toBeVisible();

    await page.goto("/");
    const goals = page.locator("section[aria-labelledby=goals-title]");
    await expect(goals.getByText("Музыкальная неделя")).toBeVisible({
      timeout: 15000,
    });
    await expect(goals.getByText(/из 25 прослушиваний/)).toBeVisible();
    await expect(goals.getByText("выполнено 0 из 1")).toBeVisible();
  });
});

test.describe("Library", () => {
  test("library and cleanup pages open", async ({ page }) => {
    await signUp(page, "library");
    await page.goto("/library");
    await expect(
      page.getByRole("heading", { name: "Моя библиотека" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: /Навести порядок/ }).click();
    await expect(
      page.getByRole("heading", { name: "Порядок в истории" }),
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Artist and track pages", () => {
  test("show a publicly played track and its link preview", async ({
    page,
    request,
  }) => {
    await signUp(page, "catalog");
    const artist = uniqueName("Artist");
    const title = "Песня для теста";
    await scrobble(page.request, { title, artist, album: "Альбом" });

    await page.goto(`/artist/${encodeURIComponent(artist)}`);
    await expect(page.getByRole("heading", { name: artist })).toBeVisible({
      timeout: 15000,
    });
    await page
      .getByRole("link", { name: new RegExp(title) })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("link", { name: artist })).toBeVisible();

    // What a messenger sees for the track link
    const html = await (
      await request.get(page.url(), {
        headers: { "User-Agent": "TelegramBot (like TwitterBot)" },
      })
    ).text();
    expect(html).toContain(`<title>${title} — ${artist} — VEINMusic</title>`);
    const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(image).toBeTruthy();
    const png = await request.get(image!);
    expect(png.ok()).toBeTruthy();
    expect(png.headers()["content-type"]).toBe("image/png");
  });

  test("unknown artist and track say so", async ({ page }) => {
    await page.goto(`/artist/${uniqueName("nobody")}`);
    await expect(page.getByText("Артист не найден")).toBeVisible({
      timeout: 15000,
    });
    await page.goto("/track/999999999");
    await expect(page.getByText("Трек не найден")).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe("Link previews and search engines", () => {
  test("a profile link has its own title, description and picture", async ({
    page,
    request,
  }) => {
    const username = await signUp(page, "preview");
    const html = await (
      await request.get(`/user/${username}`, {
        headers: { "User-Agent": "TelegramBot (like TwitterBot)" },
      })
    ).text();
    expect(html).toContain(`<title>@${username} — VEINMusic</title>`);
    expect(html).toMatch(/<meta name="description" content="[^"]*VEINMusic/);
    expect(html).toContain('property="og:type" content="profile"');
    const png = await request.get(`/user/${username}/opengraph-image`);
    expect(png.ok()).toBeTruthy();
    expect(png.headers()["content-type"]).toBe("image/png");
  });

  test("hiding the profile from search engines adds noindex", async ({
    page,
    request,
  }) => {
    const username = await signUp(page, "hidden");
    const prefs = await (
      await page.request.get(`${API_URL}/api/profile/preferences`)
    ).json();
    prefs.privacy.search_indexing = false;
    const saved = await page.request.put(`${API_URL}/api/profile/preferences`, {
      data: prefs,
      headers: { Origin: "http://localhost:3000" },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const html = await (
      await request.get(`/user/${username}`, {
        headers: { "User-Agent": "TelegramBot (like TwitterBot)" },
      })
    ).text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain(`/user/${username}<`);
  });

  test("robots.txt points to the sitemap", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /settings");
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain("<urlset");
  });
});

test("the offline page explains what is available", async ({ page }) => {
  await page.goto("/offline");
  await expect(
    page.getByRole("heading", { name: "Нет соединения" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "На главную", exact: true }),
  ).toBeVisible();
});
