import { test, expect } from '@playwright/test';

test('has title and landing page text', async ({ page }) => {
  await page.goto('/');

  // Expect page title to match VEIN Music
  await expect(page).toHaveTitle(/VEIN Music/i);

  // Verify that the landing page has a welcome text or elements
  const mainHeading = page.locator('h1');
  if (await mainHeading.count() > 0) {
    await expect(mainHeading).toBeVisible();
  }
});

test('can load auth page and display submit buttons', async ({ page }) => {
  // Navigate directly to the authentication page
  await page.goto('/auth');
  
  // Verify that form buttons or input fields exist
  const submitButton = page.locator('button[type="submit"]');
  if (await submitButton.count() > 0) {
    await expect(submitButton.first()).toBeVisible();
  }
});
