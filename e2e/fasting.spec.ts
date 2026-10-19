import { expect, test } from '@playwright/test';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('fasting card at 2 PM, eating window at 11:30 AM', async ({ page }) => {
  await pinClock(page, today(), '14:00');
  await login(page);
  await expect(page.getByLabel('Fasting')).toContainText('🌙 Fasting');
  await expect(page.getByLabel('Fasting')).toContainText('opens 12:00 AM · in 10h');

  await pinClock(page, today(), '11:30');
  await page.reload();
  await expect(page.getByLabel('Fasting')).toContainText('🍽️ Eating window');
  await expect(page.getByLabel('Fasting')).toContainText('1h 30m');
  await expect(page.getByLabel('Fasting')).toContainText('left · closes 1:00 PM');
});

test('windows are validated and saved', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /Settings/ }).click();
  const section = page.getByRole('region', { name: 'Fasting' });
  await section.getByLabel('Window 2 start').fill('00:30');
  await section.getByLabel('Window 2 start').dispatchEvent('change');
  await section.getByRole('button', { name: 'Save windows' }).click();
  await expect(section.getByRole('alert')).toHaveText("Windows can't overlap");
  await section.getByLabel('Window 2 start').fill('12:00');
  await section.getByLabel('Window 2 start').dispatchEvent('change');
  await section.getByRole('button', { name: 'Save windows' }).click();
  await expect(section.getByRole('status')).toHaveText('Saved');
});
