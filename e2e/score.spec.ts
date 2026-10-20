import { expect, test } from '@playwright/test';
import { login, resetTestUser } from './helpers';

test.beforeEach(resetTestUser);

test('the score card opens what is left today, and a routine can be ticked from there', async ({ page }) => {
  await login(page);
  await page.getByLabel("Today's score").getByRole('button').click();
  const sheet = page.getByRole('dialog', { name: "What's left today" });
  await expect(sheet).toContainText('PM skincare');
  const saved = page.waitForResponse((r) => r.url().includes('/rest/v1/habit_checks') && r.request().method() === 'POST');
  await sheet.getByRole('button', { name: 'Tick PM skincare' }).click();
  await saved;
  await expect(sheet.getByLabel('Done')).toContainText('PM skincare');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /PM skincare/ })).toHaveAttribute('aria-checked', 'true');
});
