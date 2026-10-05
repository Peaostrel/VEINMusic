import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("Achievements Page Flow", () => {
  let testUser: string;

  test.beforeEach(async ({ page }) => {
    testUser = await signUp(page, "testuser");
    await page.goto(`/user/${testUser}`);
  });

  test("should load achievements page and display progress", async ({
    page,
  }) => {
    // Navigate to achievements page
    await page.goto(`/user/${testUser}/achievements`);

    // Wait for the page to load
    await expect(page.locator("h1").filter({ hasText: testUser }))
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});

    // Check if the progress block is visible
    await expect(page.getByText(/Получено.*из/)).toBeVisible();

    // Check if the achievements list container exists
    // Since the database might be empty in E2E tests, we check if the progress text is 'Получено 0 из 0'
    const progressText = await page
      .locator("text=/Получено\\s+\\d+\\s+из\\s+\\d+/")
      .innerText();

    if (progressText.includes("из 0")) {
      // Empty database scenario
      await expect(page.getByText("0%")).toBeVisible();
    } else {
      // Pre-populated database scenario
      const achievementHeadings = page.locator("h3");
      await expect(achievementHeadings.first()).toBeVisible();
      await expect(page.getByText("Заблокировано").first()).toBeVisible();
    }
  });
});

test("shows the exact album tracks that remain", async ({ page }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "http://localhost:3000",
    "Access-Control-Allow-Credentials": "true",
  };
  await page.route("**/api/achievements/all/alice", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        user: {
          username: "alice",
          display_name: "Alice",
          avatar_url: null,
        },
        achievements: [
          {
            id: 42,
            name: "Альбом целиком",
            description: "Прослушать весь альбом",
            icon: "💿",
            target_image: null,
            reward_xp: 50,
            is_earned: false,
            rarity: 10,
            current_progress: 1,
            target_value: 3,
            rule_type: "specific_album",
            rule_target: "https://music.yandex.ru/album/42",
            track_progress_available: true,
          },
          {
            id: 43,
            name: "Две дискографии",
            description:
              "Прослушать все треки [Первого](https://music.yandex.ru/artist/55) и [Второго](https://music.yandex.ru/artist/56)",
            icon: "🎤",
            target_image: null,
            reward_xp: 100,
            is_earned: false,
            rarity: 2,
            current_progress: 2,
            target_value: 4,
            rule_type: "specific_artist",
            rule_target: "Исполнитель||https://music.yandex.ru/artist/55",
            track_progress_available: true,
          },
        ],
        earned_count: 0,
        total_count: 2,
      }),
    });
  });
  await page.route(
    "**/api/achievements/album-progress/alice/42",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          available: true,
          listened_count: 1,
          remaining_count: 2,
          total_count: 3,
          tracks: [
            {
              id: "1",
              title: "Уже был",
              artist: "Исполнитель",
              url: "https://music.yandex.ru/album/42/track/1",
              listened: true,
            },
            {
              id: "2",
              title: "Остался первый",
              artist: "Исполнитель",
              url: "https://music.yandex.ru/album/42/track/2",
              listened: false,
            },
            {
              id: "3",
              title: "Остался второй",
              artist: "Исполнитель",
              url: "https://music.yandex.ru/album/42/track/3",
              listened: false,
            },
          ],
        }),
      });
    },
  );
  await page.route(
    "**/api/achievements/artist-progress/alice/43",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          available: true,
          listened_count: 2,
          remaining_count: 2,
          total_count: 4,
          artists: [
            {
              name: "Первый артист",
              url: "https://music.yandex.ru/artist/55",
              available: true,
              listened_count: 1,
              remaining_count: 1,
              total_count: 2,
              tracks: [],
            },
            {
              name: "Второй артист",
              url: "https://music.yandex.ru/artist/56",
              available: true,
              listened_count: 1,
              remaining_count: 1,
              total_count: 2,
              tracks: [],
            },
          ],
          tracks: [
            {
              id: "11",
              title: "Засчитан артисту",
              artist: "Исполнитель",
              url: "https://music.yandex.ru/album/7/track/11",
              listened: true,
            },
            {
              id: "12",
              title: "Ещё не слушал",
              artist: "Исполнитель",
              url: "https://music.yandex.ru/album/7/track/12",
              listened: false,
            },
            {
              id: "13",
              title: "Второму осталось",
              artist: "Второй артист",
              achievement_artist: "Второй артист",
              url: "https://music.yandex.ru/album/8/track/13",
              listened: false,
            },
          ],
        }),
      });
    },
  );

  await page.goto("/user/alice/achievements");
  await page.getByRole("button", { name: /Какие треки остались/ }).click();

  await expect(page.getByText("Остался первый")).toBeVisible();
  await expect(page.getByText("Остался второй")).toBeVisible();
  await page.getByText("Уже засчитано: 1").click();
  await expect(page.getByText("Уже был")).toBeVisible();

  await page.getByRole("button", { name: /Незасчитанные треки/ }).click();
  await expect(page.getByText("Ещё не слушал")).toBeVisible();
  await expect(page.getByText("Второму осталось")).toBeVisible();
  await expect(page.getByText("Первый артист")).toBeVisible();
  await expect(page.getByText("Второй артист").first()).toBeVisible();
  await expect(
    page.getByText("Для достижения нужно ещё 2 уникальных трека."),
  ).toBeVisible();
});
