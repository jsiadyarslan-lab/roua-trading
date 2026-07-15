/**
 * Mobile Responsive Design Tests
 *
 * Verifies that the landing page renders correctly at common viewport sizes
 * and that no horizontal overflow occurs (which would indicate broken layout).
 *
 * Tests the fixes from Phase 1:
 *   - hamburger menu appears on mobile
 *   - no horizontal overflow
 *   - H1 is reasonable size on desktop (was 160px before fix)
 *   - hero CTA buttons don't overflow on mobile
 */
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 16 Pro Max', width: 430, height: 932 },
  { name: 'iPad Mini', width: 768, height: 1024 },
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'Large Desktop', width: 1920, height: 1080 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`Responsive layout: ${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('no horizontal overflow on landing page', async ({ page }) => {
      await page.goto('/ar');
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        return {
          scrollWidth: docWidth,
          windowWidth: winWidth,
          overflow: docWidth - winWidth,
        };
      });

      expect(overflow.overflow, `overflow: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(0);
    });

    test('H1 has reasonable font size (was 160px before fix)', async ({ page }) => {
      await page.goto('/ar');
      await page.waitForLoadState('networkidle');

      const h1Size = await page.locator('h1').first().evaluate(el => {
        return parseFloat(getComputedStyle(el).fontSize);
      });

      // Should be between 32px (mobile) and 80px (desktop max)
      expect(h1Size, 'H1 size should be reasonable').toBeGreaterThanOrEqual(32);
      expect(h1Size, 'H1 size should not exceed 100px (was 160 before)').toBeLessThanOrEqual(100);
    });

    test('hero CTA buttons fit within viewport on mobile', async ({ page }) => {
      test.skip(viewport.width >= 768, 'only tested on mobile');
      await page.goto('/ar');
      await page.waitForLoadState('networkidle');

      const buttons = page.locator('.hero-cta-group a, .hero-cta-group button');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const rect = await buttons.nth(i).boundingBox();
        if (rect) {
          // Button should not extend past viewport width
          expect(rect.x + rect.width, `button ${i} extends past viewport`).toBeLessThanOrEqual(
            viewport.width + 1
          );
          // Button should have positive x (not off-screen left)
          expect(rect.x, `button ${i} is off-screen left`).toBeGreaterThanOrEqual(-1);
        }
      }
    });
  });
}

test.describe('Mobile hamburger menu (Phase 1 fix)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('hamburger button is visible on mobile', async ({ page }) => {
    await page.goto('/ar');
    await page.waitForLoadState('networkidle');

    // Look for any of the hamburger patterns we added
    const hamburger = page.locator(
      '.nav-hamburger, button[aria-label*="قائمة"], button[aria-label*="menu" i]'
    );
    await expect(hamburger).toHaveCount(1);
    await expect(hamburger).toBeVisible();
  });

  test('clicking hamburger opens mobile menu', async ({ page }) => {
    await page.goto('/ar');
    await page.waitForLoadState('networkidle');

    const hamburger = page.locator(
      '.nav-hamburger, button[aria-label*="قائمة"], button[aria-label*="menu" i]'
    );
    await hamburger.click();

    // The expanded state should change
    const expanded = await hamburger.getAttribute('aria-expanded');
    expect(expanded).toBe('true');

    // Mobile menu should be visible
    const mobileMenu = page.locator('.nav-mobile-menu, [role="menu"]');
    await expect(mobileMenu).toBeVisible();
  });
});

test.describe('Login form accessibility (Phase 1 fix)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('email input has id, name, and autoComplete attributes', async ({ page }) => {
    await page.goto('/ar/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toHaveCount(1);

    await expect(emailInput).toHaveId(/.+/);
    expect(await emailInput.getAttribute('name')).toBeTruthy();
    expect(await emailInput.getAttribute('autocomplete')).toBe('email');
    expect(await emailInput.getAttribute('aria-label')).toBeTruthy();
  });

  test('email input has font-size ≥ 16px (prevents iOS zoom)', async ({ page }) => {
    await page.goto('/ar/login');
    await page.waitForLoadState('networkidle');

    const fontSize = await page
      .locator('input[type="email"]')
      .first()
      .evaluate(el => parseFloat(getComputedStyle(el).fontSize));

    expect(fontSize, 'font-size should be ≥ 16px to prevent iOS zoom').toBeGreaterThanOrEqual(16);
  });
});
