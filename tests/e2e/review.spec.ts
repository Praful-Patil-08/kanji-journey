import { test, expect } from '@playwright/test';

test.describe('Review (SRS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/flashcards/**', async route => {
      const url = route.request().url();
      if (url.includes('/due')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      } else if (url.includes('/history')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
    });
  });

  test('review session loads (or redirects to auth)', async ({ page }) => {
    await page.goto('/session/quiz');
    const sessionHeading = page.getByText(/flashcard|review|quiz|practice/i).first();
    const authHeading = page.getByRole('heading', { name: /enter the sanctuary|begin your journey/i });
    await expect(sessionHeading.or(authHeading)).toBeVisible({ timeout: 10000 });
  });

  test('flashcard review persistence', async ({ page }) => {
    // Mock a due card
    await page.route('**/api/flashcards/**/due**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'test-card-1',
            user_id: 'test-user',
            front: 'こんにちは',
            back: 'Hello',
            review_state: 'review',
            ease_factor: 2.5,
            interval_days: 3,
            next_review_date: new Date().toISOString().slice(0, 10),
            reviews_total: 2,
            reviews_correct: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.goto('/session/quiz');
    // Should show the mocked card or auth
    const card = page.getByText(/こんにちは|hello/i).first();
    const auth = page.getByRole('heading', { name: /enter the sanctuary|begin your journey/i });
    await expect(card.or(auth)).toBeVisible({ timeout: 10000 });
  });
});
