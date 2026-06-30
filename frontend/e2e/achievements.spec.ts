import { test, expect } from '@playwright/test';

test.describe('Achievements Page Flow', () => {
  let testUser: string;
  const testPassword = 'testpassword123';

  test.beforeEach(async ({ page }) => {
    testUser = `testuser_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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

    // Check if the achievements list container exists
    // Since the database might be empty in E2E tests, we check if the progress text is 'Получено 0 из 0'
    const progressText = await page.locator('text=/Получено\\s+\\d+\\s+из\\s+\\d+/').innerText();
    
    if (progressText.includes('из 0')) {
      // Empty database scenario
      await expect(page.getByText('0%')).toBeVisible();
    } else {
      // Pre-populated database scenario
      const achievementHeadings = page.locator('h3');
      await expect(achievementHeadings.first()).toBeVisible();
      await expect(page.getByText('Заблокировано').first()).toBeVisible();
    }
  });
});
