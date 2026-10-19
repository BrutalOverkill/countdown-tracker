import { expect, test } from '@playwright/test';
import { login, resetTestUser } from './helpers';

test.beforeEach(resetTestUser);

test('going offline shows the banner and disables ticking', async ({ page, context }) => {
  await login(page);
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: "Offline — changes won't save" })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /AM skincare/ })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole('checkbox', { name: /AM skincare/ })).toBeEnabled();
});
