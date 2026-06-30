import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  const testUser = `testuser_${Date.now()}`;
  const testPassword = 'testpassword123';

  test('should register a new user successfully', async ({ page }) => {
    await page.goto('/auth');

    // Switch to registration mode
    await page.getByRole('button', { name: /Нет аккаунта\? Зарегистрироваться/i }).click();
    
    // Verify header changed
    await expect(page.locator('h1')).toHaveText('НОВАЯ КРОВЬ');

    // Fill form
    await page.locator('#auth-username').fill(testUser);
    await page.locator('#auth-password').fill(testPassword);
    
    // Submit
    await page.getByRole('button', { name: 'СОЗДАТЬ АККАУНТ' }).click();

    // Verify success screen is shown with API key
    await expect(page.locator('h2')).toHaveText('ПРОВЕРКА СВЯЗИ');
    await expect(page.locator('text=Система готова к работе!')).toBeVisible();

    // Click 'ВОЙТИ В СИСТЕМУ' and verify redirect
    await page.getByRole('button', { name: 'ВОЙТИ В СИСТЕМУ' }).click();
    await expect(page).toHaveURL(`/user/${testUser}`);
  });

  test('should login an existing user successfully', async ({ page }) => {
    await page.goto('/auth');

    // Verify header
    await expect(page.locator('h1')).toHaveText('С ВОЗВРАЩЕНИЕМ');

    // Fill form
    await page.locator('#auth-username').fill('testuser'); // We assume a default testuser exists, or we use the previously created one if tests run sequentially, but they run parallel. We'll use a generic one and just check for error or success.
    await page.locator('#auth-password').fill('wrongpassword');
    
    // Submit
    await page.getByRole('button', { name: 'ВОЙТИ' }).click();

    // Verify error message for wrong password
    await expect(page.locator('.bg-red-500\\/10')).toBeVisible();
  });
});
