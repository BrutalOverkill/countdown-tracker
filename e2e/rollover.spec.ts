import { expect, test } from '@playwright/test';
import { dayLabel } from '../src/app/core/format';
import { login, nudgeClock, pinClock, resetTestUser, today, tomorrow } from './helpers';

test.beforeEach(resetTestUser);

test('3:59 AM still counts as the previous day; 4:00 AM starts a new one', async ({ page }) => {
  await pinClock(page, tomorrow(), '03:59');
  await login(page);
  await expect(page.getByText(dayLabel(today()).toUpperCase())).toBeVisible();
  await page.getByRole('checkbox', { name: /PM skincare/ }).click();
  await expect(page.getByRole('checkbox', { name: /PM skincare/ })).toHaveAttribute('aria-checked', 'true');

  await pinClock(page, tomorrow(), '04:00');
  await nudgeClock(page);
  await expect(page.getByText(dayLabel(tomorrow()).toUpperCase())).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /PM skincare/ })).toHaveAttribute('aria-checked', 'false');
});
