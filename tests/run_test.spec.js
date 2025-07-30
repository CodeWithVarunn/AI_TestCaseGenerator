// tests/run_test.spec.js
import { test, expect } from '@playwright/test';

test.describe('Simple Verification Test', () => {
  test('should visit Playwright website and verify the title', async ({ page }) => {
    // Navigate to a real, public website
    await page.goto('https://playwright.dev/');

    // Check that the title of the page is correct
    await expect(page).toHaveTitle(/Playwright/);
  });
});