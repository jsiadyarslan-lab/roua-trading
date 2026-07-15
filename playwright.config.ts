// @ts-check
/**
 * Playwright config for PWA + E2E tests.
 *
 * Tests run against the production build (bun run start).
 * The server is expected to be running on http://localhost:3000
 * before tests start.
 *
 * Run locally:
 *   cd apps/web && bun run build && bun run start &
 *   npx playwright test --config=../.. /tests
 *
 * CI: .github/workflows/e2e.yml handles build + start + test.
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],

  // Fail fast on CI, full retries locally
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Desktop Chrome
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },

    // Mobile Chrome (PWA testing)
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 9'],
        isMobile: true,
        hasTouch: true,
      },
    },

    // Mobile Safari (iOS PWA behavior)
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 16'],
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  // If running locally without a server, start one
  webServer: process.env.CI
    ? undefined
    : {
        command: 'cd apps/web && bun run start',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
