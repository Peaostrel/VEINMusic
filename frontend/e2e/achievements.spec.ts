import { test, expect } from '@playwright/test';

test.describe('Achievements Page Flow', () => {
  const testUser = `testuser_${Date.now()}`;
  const testPassword = 'testpassword123';

  test.beforeEach(async ({ page }) => {
    // Register the user first to ensure they exist
    await page.goto('/auth');
    await page.getByRole('button', { name: /Нет аккаунта\? Зарегистрироваться/i }).click();
    await page.locator('#auth-username').fill(testUser);
    await page.locator('#auth-password').fill(testPassword);
    await page.getByRole('button', { name: 'СОЗДАТЬ АККАУНТ' }).click();
    await page.getByRole('button', { name: 'ВОЙТИ В СИСТЕМУ' }).click();
    await page.waitForURL(`**/user/${testUser}`);
  });

  test('should load achievements page and display progress', async ({ page }) => {
    // Navigate to achievements page
    await page.goto(`/user/${testUser}/achievements`);

    // Wait for the page to load
    await expect(page.locator('h1').filter({ hasText: testUser })).toBeVisible({ timeout: 10000 }).catch(() => {});

    // Check if the progress block is visible
    await expect(page.getByText(/Получено.*из/)).toBeVisible();

    // Check if the achievements list container has at least one achievement
    // All achievements are rendered in an h3 tag
    const achievementHeadings = page.locator('h3');
    await expect(achievementHeadings.first()).toBeVisible();
    
    // Check for 'Заблокировано' text since it's a new user and they likely haven't earned all achievements
    await expect(page.getByText('Заблокировано').first()).toBeVisible();
  });
});
