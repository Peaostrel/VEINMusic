import { test, expect } from "@playwright/test";
import { apiPost, signUp } from "./helpers";

test("a new follower shows up in the notifications bell", async ({
  page,
  browser,
}) => {
  const alice = await signUp(page, "alice");

  const other = await browser.newContext();
  const bobPage = await other.newPage();
  await signUp(bobPage, "bob");
  const follow = await apiPost(bobPage.request, `/api/follow/${alice}`);
  expect(follow.ok()).toBeTruthy();
  await other.close();

  await page.goto("/");
  const bell = page.getByRole("button", {
    name: /Уведомления: 1 непрочитанных/,
  });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByText(/подписался\(ась\) на вас/)).toBeVisible();
  // Opening the list marks everything as read
  await expect(
    page.getByRole("button", { name: "Уведомления", exact: true }),
  ).toBeVisible();
});
