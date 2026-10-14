import { test, expect } from "@playwright/test";
const headers = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Credentials": "true",
};

test("verification requires an explicit click and removes the token from the URL", async ({
  page,
}) => {
  const token = "a".repeat(43);
  const requests: unknown[] = [];
  await page.route("**/auth/email/verify", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ headers, json: { message: "Почта подтверждена" } });
  });
  await page.goto(`/email/verify#${token}`);
  await expect(
    page.getByRole("button", { name: "Подтвердить", exact: true }),
  ).toBeEnabled();
  await expect(page).toHaveURL(/\/email\/verify$/);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Почта подтверждена");
  expect(requests).toEqual([{ token }]);
});

test("recovery accepts an address without exposing account existence", async ({
  page,
}) => {
  await page.route("**/auth/password/forgot", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "user@example.com",
    });
    await route.fulfill({
      headers,
      json: {
        message:
          "Если почта привязана к аккаунту, мы отправим ссылку восстановления",
      },
    });
  });
  await page.goto("/email/forgot");
  await page.getByLabel("Почта", { exact: true }).fill("user@example.com");
  await page.getByRole("button", { name: "Получить письмо" }).click();
  await expect(page.getByRole("status")).toContainText("Если почта привязана");
});

test("reset sends the token and second factor only after submitting", async ({
  page,
}) => {
  const token = "b".repeat(43);
  await page.route("**/auth/password/reset", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      token,
      password: "new-password",
      otp_code: "123456",
    });
    await route.fulfill({ headers, json: { message: "Пароль изменён" } });
  });
  await page.goto(`/email/reset#${token}`);
  await page.getByLabel("Новый пароль", { exact: true }).fill("new-password");
  await page.getByLabel("Код 2FA, если защита включена").fill("123456");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page.getByRole("status")).toHaveText("Пароль изменён");
});
