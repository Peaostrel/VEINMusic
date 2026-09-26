import { test, expect } from "@playwright/test";
import { API_URL, signUp } from "./helpers";

async function newDeviceCode(page: import("@playwright/test").Page) {
  const res = await page.request.post(`${API_URL}/api/devices/code`, {
    data: { client_name: "E2E Extension" },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { device_code: string; user_code: string };
}

test.describe("Device linking (/link)", () => {
  test("asks an anonymous visitor to sign in", async ({ page }) => {
    const { user_code } = await newDeviceCode(page);
    await page.goto(`/link?code=${user_code}`);
    await expect(
      page.getByText("Чтобы подтвердить устройство, войдите в аккаунт."),
    ).toBeVisible();
  });

  test("approves a device and issues its key", async ({ page }) => {
    await signUp(page, "link");
    const { device_code, user_code } = await newDeviceCode(page);

    await page.goto("/link");
    await page.getByLabel("Код устройства").fill(user_code.replace("-", ""));
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByText("E2E Extension")).toBeVisible();
    await page.getByRole("button", { name: "Разрешить" }).click();
    await expect(page.getByText("Устройство подключено")).toBeVisible();

    const token = await page.request.post(`${API_URL}/api/devices/token`, {
      data: { device_code },
    });
    const body = await token.json();
    expect(body.status).toBe("approved");
    expect(body.api_key).toMatch(/^vm_/);
  });

  test("denies a device", async ({ page }) => {
    await signUp(page, "deny");
    const { device_code, user_code } = await newDeviceCode(page);
    await page.goto(`/link?code=${user_code}`);
    await page.getByRole("button", { name: "Отклонить" }).click();
    await expect(page.getByText("Подключение отклонено.")).toBeVisible();

    const token = await page.request.post(`${API_URL}/api/devices/token`, {
      data: { device_code },
    });
    expect((await token.json()).status).toBe("denied");
  });

  test("reports an unknown code", async ({ page }) => {
    await signUp(page, "badcode");
    await page.goto("/link");
    await page.getByLabel("Код устройства").fill("ZZZZ-ZZZZ");
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByText("Код не найден или устарел")).toBeVisible();
  });
});
