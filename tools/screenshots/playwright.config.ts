import { defineConfig } from '@playwright/test'

// Runs capture.ts, which saves the README screenshots to docs/screenshots.
export default defineConfig({
  testDir: '.',
  testMatch: 'capture.ts',
  workers: 1,
  maxFailures: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: 'test-results',
  use: { browserName: 'chromium' },
})
