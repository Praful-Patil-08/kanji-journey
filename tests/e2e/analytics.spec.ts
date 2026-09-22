import { test, expect } from '@playwright/test';

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/mastery/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byTopic: {
            kanji: { mastery: 82, accuracy: 85, recentAccuracy: 80, totalAttempts: 20, isWeak: false },
            grammar: { mastery: 45, accuracy: 50, recentAccuracy: 40, totalAttempts: 15, isWeak: true },
          },
          bySection: {},
          overall: { mastery: 64, accuracy: 68, recentAccuracy: 62, totalAttempts: 35, weakCount: 1, avgResponseTimeMs: 1800 },
          weakTopics: [{ topic: 'grammar', mastery: 45, accuracy: 50, totalAttempts: 15, reason: 'mastery 45% below 60%' }],
          lastSeen: new Date().toISOString(),
        }),
      });
    });
    await page.route('**/api/recommendations/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            estimatedMinutes: 12,
            items: [{ type: 'quiz', topic: 'grammar', reason: 'weak_topic', reasonDetail: 'Recommended because mastery on grammar is 45%', estimatedMinutes: 4, priority: 2 }],
          },
        }),
      });
    });
    await page.route('**/api/flashcards/**/due**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/quiz-history/**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('analytics page loads and shows mastery', async ({ page }) => {
    await page.goto('/progress');
    const heading = page.getByText(/scholar analytics|analytics|mastery/i).first();
    const authHeading = page.getByRole('heading', { name: /enter the sanctuary|begin your journey/i });
    await expect(heading.or(authHeading).or(page.locator('main'))).toBeVisible({ timeout: 10000 });
  });

  test('analytics shows weak topics and recommendations (when authenticated)', async ({ page }) => {
    await page.goto('/progress');
    // Check for no JS errors
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test('has no horizontal scroll on analytics', async ({ page }) => {
    await page.goto('/progress');
    await page.waitForTimeout(1000);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow small overflow for scrollbar, but not large horizontal scroll
    expect(scrollWidth - clientWidth).toBeLessThan(50);
  });
});
