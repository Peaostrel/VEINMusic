import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Must be on the same site as the frontend (localhost) so the
 * SameSite=Strict session cookie is sent with API requests. */
export const API_URL = process.env.E2E_API_URL || "http://localhost:8000";
const ORIGIN = "http://localhost:3000";
export const PASSWORD = "testpassword123";

export function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/** Register through the API (the session cookie lands in the page's
 * context) and remember the username like the auth page does. */
export async function signUp(page: Page, prefix = "e2e"): Promise<string> {
  const username = uniqueName(prefix);
  const res = await page.request.post(`${API_URL}/auth/register`, {
    data: { username, password: PASSWORD },
    headers: { Origin: ORIGIN },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.addInitScript((name) => {
    localStorage.setItem("username", name);
  }, username);
  return username;
}

/** POST to the API as the page's signed-in user. */
export function apiPost(
  request: APIRequestContext,
  url: string,
  data: unknown = {},
) {
  return request.post(`${API_URL}${url}`, {
    data,
    headers: { Origin: ORIGIN },
  });
}

/** Grant a role with the operator CLI against the E2E database. */
export function setRole(username: string, role: "admin" | "user") {
  execFileSync(
    process.env.E2E_PYTHON || "python",
    ["-m", "app.cli", "set-role", username, role],
    {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DATABASE_URL: process.env.E2E_DATABASE_URL || "sqlite:///./e2e_test.db",
      },
      stdio: "pipe",
    },
  );
}
