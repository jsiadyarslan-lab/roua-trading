/**
 * PWA Installability Tests
 *
 * Verifies that the site meets Chrome's PWA installability criteria:
 *   1. HTTPS (or localhost for testing)
 *   2. Valid Web App Manifest at the URL declared in <link rel="manifest">
 *   3. Service Worker with a fetch handler
 *   4. Icons 192x192 and 512x512
 *
 * These tests run on every PR + main push.
 */
import { test, expect } from '@playwright/test';

const PAGES = [
  '/',
  '/ar',
  '/en',
  '/fr',
  '/ar/login',
  '/ar/offline',
];

for (const page of PAGES) {
  test.describe(`PWA installability: ${page}`, () => {
    test('manifest link is present and points to a valid URL', async ({ page: browser }) => {
      await browser.goto(page);
      const manifestLink = browser.locator('link[rel="manifest"]');
      await expect(manifestLink).toHaveCount(1);

      const href = await manifestLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).not.toContain('undefined');
      expect(href).not.toContain('[locale]');
    });

    test('manifest is valid JSON with required fields', async ({ page: browser, request }) => {
      await browser.goto(page);
      const href = await browser.locator('link[rel="manifest"]').getAttribute('href');
      expect(href).toBeTruthy();

      const manifestUrl = href!.startsWith('http')
        ? href!
        : new URL(href!, browser.url()).toString();

      const response = await request.get(manifestUrl);
      expect(response.status(), `GET ${manifestUrl} should return 200`).toBe(200);
      expect(response.headers()['content-type']).toContain('json');

      const manifest = await response.json();
      expect(manifest.name, 'name is required').toBeTruthy();
      expect(manifest.short_name, 'short_name is required').toBeTruthy();
      expect(manifest.start_url, 'start_url is required').toBeTruthy();
      expect(manifest.display, 'display should be standalone').toBe('standalone');
      expect(manifest.icons, 'icons array required').toBeInstanceOf(Array);
      expect(manifest.icons.length, 'at least 2 icons').toBeGreaterThanOrEqual(2);
    });

    test('manifest has 192 and 512 icons (any purpose)', async ({ page: browser, request }) => {
      await browser.goto(page);
      const href = await browser.locator('link[rel="manifest"]').getAttribute('href');
      const manifestUrl = href!.startsWith('http')
        ? href!
        : new URL(href!, browser.url()).toString();
      const manifest = await (await request.get(manifestUrl)).json();

      const sizes = manifest.icons
        .filter((i: any) => i.purpose === 'any' || i.purpose === undefined)
        .map((i: any) => i.sizes);
      expect(sizes, 'must include 192x192').toContain('192x192');
      expect(sizes, 'must include 512x512').toContain('512x512');
    });

    test('manifest has maskable icons', async ({ page: browser, request }) => {
      await browser.goto(page);
      const href = await browser.locator('link[rel="manifest"]').getAttribute('href');
      const manifestUrl = href!.startsWith('http')
        ? href!
        : new URL(href!, browser.url()).toString();
      const manifest = await (await request.get(manifestUrl)).json();

      const maskable = manifest.icons.filter((i: any) => i.purpose === 'maskable');
      expect(maskable.length, 'should have at least 1 maskable icon').toBeGreaterThanOrEqual(1);
    });

    test('service worker is registered', async ({ page: browser }) => {
      await browser.goto(page);
      // Wait for SW registration (PWARegistrar.tsx runs on mount)
      await browser.waitForTimeout(2000);

      const swRegistered = await browser.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false;
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.length > 0;
      });
      expect(swRegistered, 'service worker should be registered').toBe(true);
    });

    test('apple-touch-icon link is present', async ({ page: browser }) => {
      await browser.goto(page);
      // layout.tsx declares both 180x180 and 512x512 as apple-touch-icon
      const appleIcon = browser.locator('link[rel="apple-touch-icon"]');
      const count = await appleIcon.count();
      expect(count, 'should have at least 1 apple-touch-icon').toBeGreaterThanOrEqual(1);
    });

    test('theme-color meta is present', async ({ page: browser }) => {
      await browser.goto(page);
      const themeColor = browser.locator('meta[name="theme-color"]');
      await expect(themeColor).toHaveCount(1);
      const content = await themeColor.getAttribute('content');
      expect(content).toMatch(/^#[0-9a-f]{6}$/i);
    });

    test('viewport does not disable user scaling (WCAG 2.1 SC 1.4.4)', async ({ page: browser }) => {
      await browser.goto(page);
      const viewport = browser.locator('meta[name="viewport"]');
      const content = (await viewport.getAttribute('content')) || '';
      // Should NOT contain maximum-scale=1 or user-scalable=no
      expect(content, 'maximum-scale=1 violates WCAG').not.toMatch(/maximum-scale\s*=\s*1\b/);
      expect(content, 'user-scalable=no violates WCAG').not.toMatch(/user-scalable\s*=\s*no\b/i);
    });

    test('main landmark exists (WCAG 2.4.1)', async ({ page: browser }) => {
      await browser.goto(page);
      const main = browser.locator('main, [role="main"]');
      await expect(main).toHaveCount(1);
    });

    test('skip-link is present for keyboard users', async ({ page: browser }) => {
      await browser.goto(page);
      const skipLink = browser.locator('a.skip-link, a[href^="#main"]');
      await expect(skipLink).toHaveCount(1);
    });
  });
}
