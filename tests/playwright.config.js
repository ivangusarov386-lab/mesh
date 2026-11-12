import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './fixtures/preflight.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30000,
  expect: { timeout: 10000 },
  outputDir: './artifacts/e2e/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: './artifacts/e2e/html', open: 'never' }],
    ['junit', { outputFile: './artifacts/e2e/results.xml' }],
    ['json', { outputFile: './artifacts/e2e/results.json' }]
  ],
  projects: [{ name: 'chromium-mv3' }]
});
