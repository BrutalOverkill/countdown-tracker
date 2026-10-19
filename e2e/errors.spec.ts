import { expect, test } from '@playwright/test';
import { resetTestUser } from './helpers';

test.beforeEach(resetTestUser);

test('a failed data load shows Retry, and Retry recovers', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.abort());
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(process.env['E2E_EMAIL']!);
  await page.getByPlaceholder('Password').fill(process.env['E2E_PASSWORD']!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // supabase-js retries failed reads three times (1 s, 2 s, 4 s) before giving up.
  await expect(page.getByRole('alert')).toContainText("Couldn't load your data", { timeout: 20_000 });

  await page.unroute('**/rest/v1/**');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByLabel("Today's score")).toBeVisible();
});
