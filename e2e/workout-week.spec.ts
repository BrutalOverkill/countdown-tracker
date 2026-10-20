import { expect, test } from '@playwright/test';
import { addDays, weekdayOf } from '../supabase/functions/_shared/days';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('Workout is not needed on a Monday, and a session counts toward the week', async ({ page }) => {
  const monday = addDays(today(), (8 - weekdayOf(today())) % 7);
  await pinClock(page, monday, '20:00');
  await login(page);
  const card = page.getByLabel('Workout');
  await expect(card).toContainText('This week 0 / 4');
  await expect(card).not.toContainText('Needed today');
  await page.getByLabel("Today's score").getByRole('button').click();
  const sheet = page.getByRole('dialog', { name: "What's left today" });
  await expect(sheet.getByText('Workout')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await card.getByRole('button', { name: 'Trained today ✓' }).click();
  await expect(card).toContainText('This week 1 / 4');
});
