import { expect, test } from '@playwright/test';
import { addDays } from '../supabase/functions/_shared/days';
import { login, pinClock, resetTestUser, today, tomorrow } from './helpers';

test.beforeEach(resetTestUser);

test('a countdown with a challenge, then its report card on the day', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Settings/ }).click();
  const countdowns = page.getByRole('region', { name: 'Countdowns' });
  await countdowns.getByLabel('New countdown emoji').fill('🎯');
  await countdowns.getByLabel('New countdown title').fill('Test day');
  await countdowns.getByLabel('New countdown date').fill(addDays(today(), 10));
  await countdowns.getByRole('button', { name: 'Add', exact: true }).click();
  const row = countdowns.getByRole('group', { name: 'Test day' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '+ Add challenge' }).click();
  await row.getByLabel('Challenge habit').selectOption({ label: 'AM skincare' });
  await row.getByLabel('Target days').fill('8');
  await row.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(row).toContainText('AM skincare on 8 of 10 days');

  await page.getByRole('link', { name: /Today/ }).click();
  await expect(page.getByLabel('Test day challenges')).toContainText('ON TRACK');

  // Move the date to tomorrow so the report day arrives in the test.
  await page.getByRole('link', { name: /Settings/ }).click();
  await row.getByRole('button', { name: /Test day/ }).click();
  await row.getByLabel('Date', { exact: true }).fill(tomorrow());
  await row.getByRole('button', { name: 'Save' }).click();

  await pinClock(page, tomorrow(), '12:00');
  await page.goto('/today');
  await expect(page.getByLabel('Countdowns')).toContainText('Today! 🎯');
  await page.getByRole('link', { name: 'See your report card →' }).click();
  await expect(page.getByText('Test day report card')).toBeVisible();
  await expect(page.getByTestId('grade')).toBeVisible();
});
