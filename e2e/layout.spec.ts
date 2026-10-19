import { expect, test } from '@playwright/test';
import { login, resetTestUser } from './helpers';

test.beforeEach(resetTestUser);

test('no tab is wider than the screen', async ({ page }) => {
  await login(page);
  const width = page.viewportSize()!.width;
  const tabs = { Today: /let's get it/, Habits: 'Habits', Food: 'Food', Settings: 'Settings' };
  for (const [tab, heading] of Object.entries(tabs)) {
    await page.getByRole('link', { name: new RegExp(tab) }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${tab} scrolls sideways`).toBeLessThanOrEqual(width);
  }
});
