import { test, expect } from "@playwright/test";
import { API_URL, scrobble, setRole, signUp, uniqueName } from "./helpers";

test("a reported track reaches the admin, is removed and the reporter learns it", async ({
  browser,
}) => {
  const adminPage = await (await browser.newContext()).newPage();
  const admin = await signUp(adminPage, "mod");
  setRole(admin, "admin");

  const page = await (await browser.newContext()).newPage();
  await signUp(page, "reporter");
  const artist = uniqueName("Spam");
  const title = "Бонус казино";
  await scrobble(page.request, { title, artist });
  const found = await (
    await page.request.get(
      `${API_URL}/api/music/artist/${encodeURIComponent(artist)}`,
    )
  ).json();
  const trackId = found.tracks[0].id as number;

  await page.goto(`/track/${trackId}`);
  await page.getByRole("button", { name: "Пожаловаться" }).click();
  await page.getByLabel("Спам или реклама в названии").check();
  await page.getByRole("button", { name: "Отправить жалобу" }).click();
  await expect(page.getByText(/Когда её рассмотрят/)).toBeVisible();

  // The admin is told and opens the reports tab from the link
  const adminNotes = await (
    await adminPage.request.get(`${API_URL}/api/me/notifications`)
  ).json();
  expect(JSON.stringify(adminNotes)).toContain(`Новая жалоба: трек «${artist}`);
  await adminPage.goto("/admin?tab=reports");
  await expect(adminPage.getByText(`${artist} — ${title}`)).toBeVisible();
  await adminPage
    .getByLabel(/больше не принимать прослушивания исполнителя/)
    .check();
  adminPage.on("dialog", (dialog) => void dialog.accept());
  await adminPage.getByRole("button", { name: "Удалить трек" }).click();
  await expect(adminPage.getByText(/Жалобы закрыты/)).toBeVisible();
  expect(
    (await page.request.get(`${API_URL}/api/music/track/${trackId}`)).status(),
  ).toBe(404);

  const notes = await (
    await page.request.get(`${API_URL}/api/me/notifications`)
  ).json();
  expect(JSON.stringify(notes)).toContain("рассмотрена: приняты меры");
});
