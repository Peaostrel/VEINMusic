import { test, expect } from "@playwright/test";
import { API_URL, signUp } from "./helpers";

// Caddy's answers while deploy.sh restarts the containers (deploy/Caddyfile)
const UPDATING = {
  status: 503,
  headers: {
    "Access-Control-Allow-Origin": "http://localhost:3000",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "X-Maintenance",
    "X-Maintenance": "1",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ detail: "Идёт обновление, пожалуйста подождите" }),
};

test.describe("Update in progress", () => {
  test("shows the window while the API updates and reloads after", async ({
    page,
  }) => {
    await page.goto("/feed");
    await page.route(`${API_URL}/**`, (route) => route.fulfill(UPDATING));
    // An open tab's next request (here: the people search) meets the
    // update; retried until the page has hydrated
    const dialog = page.getByRole("alertdialog", { name: "Идёт обновление" });
    const search = page.getByRole("combobox", {
      name: "Поиск людей, артистов и треков",
    });
    let attempt = 0;
    await expect(async () => {
      await search.fill(`user${attempt++}`);
      await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass();

    await page.unroute(`${API_URL}/**`);
    await page.waitForEvent("load", { timeout: 15_000 });
    await expect(dialog).toHaveCount(0);
  });

  test("an endpoint's own 502 is not taken for an update", async ({ page }) => {
    await signUp(page, "maint");
    await page.route(`${API_URL}/api/geo/countries`, (route) =>
      route.fulfill({
        status: 502,
        headers: { "Access-Control-Allow-Origin": "http://localhost:3000" },
        body: JSON.stringify({ detail: "Список стран недоступен" }),
      }),
    );
    const health = page.waitForResponse((res) =>
      res.url().startsWith(`${API_URL}/health`),
    );
    await page.goto("/settings");
    await health;
    await expect(
      page.getByRole("button", { name: "Сохранить всё" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("navigation", { name: "Разделы настроек" }),
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });
});
