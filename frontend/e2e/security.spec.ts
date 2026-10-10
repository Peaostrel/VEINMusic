import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { API_URL, PASSWORD, signUp } from "./helpers";

test("two-factor enrollment downloads recovery codes and login requires the factor", async ({
  page,
  browser,
}) => {
  const username = await signUp(page, "mfasecurity");
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Безопасность и данные", exact: true })
    .click();
  const card = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Двухфакторная защита",
      exact: true,
    }),
  });
  await card.getByLabel("Пароль для двухфакторной защиты").fill(PASSWORD);
  await card.getByRole("button", { name: "Настроить защиту" }).click();
  await expect(card.locator("code")).toBeVisible();
  const secret = await card.locator("code").innerText();
  const otp = execFileSync(
    process.env.E2E_PYTHON || "python",
    ["-c", "import pyotp,sys; print(pyotp.TOTP(sys.argv[1]).now())", secret],
    { encoding: "utf8" },
  ).trim();
  await card.getByLabel("Код двухфакторной защиты").fill(otp);
  await card.getByRole("button", { name: "Подтвердить и включить" }).click();
  await expect(
    card.getByText("Защита включена. Остальные сеансы завершены."),
  ).toBeVisible();
  const codes = (await card.locator("pre").innerText()).split("\n");
  expect(codes).toHaveLength(8);
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Скачать резервные коды" }).click();
  expect((await download).suggestedFilename()).toBe(
    "veinmusic-recovery-codes.txt",
  );
  const loginPage = await browser.newPage();
  try {
    await loginPage.goto("/auth");
    await loginPage.locator("#auth-username").fill(username);
    await loginPage.locator("#auth-password").fill(PASSWORD);
    await loginPage.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(loginPage.locator("#auth-otp")).toBeVisible();
    await loginPage.locator("#auth-otp").fill(codes[0]);
    await loginPage.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(loginPage).toHaveURL(`/user/${username}`);
    const status = await loginPage.request.get(`${API_URL}/auth/2fa/status`);
    expect((await status.json()).enabled).toBe(true);
  } finally {
    await loginPage.close();
  }
});
