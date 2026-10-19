import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI passes the variables in directly.
}

export default defineConfig({
  testDir: 'e2e',
  // All specs share one test user, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4300', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: { command: 'npx ng serve --port 4300', url: 'http://localhost:4300', reuseExistingServer: true, timeout: 180_000 },
});
