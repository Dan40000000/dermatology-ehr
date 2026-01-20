import { defineConfig, devices } from '@playwright/test';

/**
 * Comprehensive Playwright E2E Testing Configuration
 * Supports both development and CI environments with proper timeouts and reporting
 */
export default defineConfig({
  testDir: './tests',

  // Test execution settings
  fullyParallel: !process.env.CI, // Run tests in parallel in dev, sequential in CI
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4, // More workers in dev for faster execution

  // Global timeout settings
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },

  // Reporting
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for the frontend application
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',

    // Trace and debugging
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',

    // Browser settings
    headless: process.env.CI ? true : false,
    viewport: { width: 1280, height: 720 },

    // Network settings
    actionTimeout: 15000,
    navigationTimeout: 30000,

    // Context options
    locale: 'en-US',
    timezoneId: 'America/New_York',

    // Ignore HTTPS errors in dev
    ignoreHTTPSErrors: !process.env.CI,
  },

  // Test projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chrome-specific settings
        launchOptions: {
          args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },

    // Mobile viewports (optional - can be run selectively)
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
      },
    },

    // Tablet viewport
    {
      name: 'iPad',
      use: {
        ...devices['iPad Pro'],
      },
    },
  ],

  // Run local dev server before starting tests (only if not already running)
  webServer: process.env.SKIP_SERVER ? undefined : {
    command: 'cd frontend && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  // Output folder for test artifacts
  outputDir: 'test-results',
});
