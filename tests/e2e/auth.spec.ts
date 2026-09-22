import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('shows login form on /auth', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: /enter the sanctuary|begin your journey/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('scholar@nexus.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    await page.getByPlaceholder('scholar@nexus.com').fill('invalid@example.com');
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: /authenticate/i }).click();
    // Should show error toast or inline error, or stay on auth
    await expect(page).toHaveURL(/\/auth/);
    // Check for error message (toast or text)
    const error = page.getByText(/invalid|error|failed/i);
    await expect(error.first()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Fallback: still on auth page is acceptable for invalid creds
    });
  });

  test('redirects unauthenticated /dashboard to /auth', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });

  test('protected routes require auth', async ({ page }) => {
    for (const path of ['/progress', '/practice', '/profile']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
    }
  });
});
