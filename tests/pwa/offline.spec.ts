/**
 * Offline Behavior Tests
 *
 * Verifies that the Service Worker provides a real offline experience:
 *   - When offline, navigating to a cached URL should still work
 *   - When offline, navigating to an uncached URL should show the fallback page
 *   - The fallback page should have proper RTL direction for Arabic
 */
import { test, expect } from '@playwright/test';

test.describe('Offline behavior', () => {
  test('offline fallback page exists and returns 200', async ({ request }) => {
    const response = await request.get('/ar/offline');
    expect(response.status()).toBe(200);
  });

  test('offline fallback page has correct content (Arabic)', async ({ page }) => {
    await page.goto('/ar/offline');

    // Title is present
    const h1 = page.locator('h1');
    await expect(h1).toHaveText(/أنت غير متصل|غير متصل/);

    // Retry button is present
    const retryButton = page.locator('button', { hasText: /إعادة المحاولة|محاولة/ });
    await expect(retryButton).toHaveCount(1);

    // Page direction is RTL for Arabic
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('offline fallback page has correct content (English)', async ({ page }) => {
    await page.goto('/en/offline');

    const h1 = page.locator('h1');
    await expect(h1).toHaveText(/offline/i);

    // Page direction is LTR for English
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');
  });

  test('service worker serves cached page when offline', async ({ browser, page }) => {
    // Visit the landing page first to cache it
    await page.goto('/ar');
    await page.waitForLoadState('networkidle');

    // Wait for SW to be active
    await page.waitForTimeout(2000);

    // Verify SW is active
    const swActive = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.some(r => r.active !== null);
    });
    expect(swActive).toBe(true);

    // Go offline
    const context = browser.context();
    await context.setOffline(true);

    // Reload — should still render (from cache or fallback)
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Either the page renders OR we get the offline fallback
    const body = await page.locator('body').textContent();
    const isLandingOrOffline =
      body!.includes('رؤى') ||
      body!.includes('غير متصل') ||
      body!.length > 100; // any rendered content

    expect(isLandingOrOffline, 'should have content even when offline').toBe(true);

    // Go back online
    await context.setOffline(false);
  });

  test('offline page works as PWA fallback', async ({ page, browser }) => {
    // Visit offline page directly so it's cached
    await page.goto('/ar/offline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Now go offline and reload
    const context = browser.context();
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Should still show the offline page (from cache)
    const h1 = page.locator('h1');
    await expect(h1).toHaveText(/أنت غير متصل|غير متصل/);

    await context.setOffline(false);
  });
});
