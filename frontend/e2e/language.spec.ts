import { expect, test } from "@playwright/test";

test("the language switch shows the site in English and back", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByText("The Russian version is the legally binding one", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ru", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(
    page.getByRole("link", { name: "Войти", exact: true }),
  ).toBeVisible();
});
