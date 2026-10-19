import { expect, test } from '@playwright/test';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('ticking routines updates the score, rings and wheel, and survives a reload', async ({ page }) => {
  await pinClock(page, today(), '21:00');
  await login(page);
  const am = page.getByRole('checkbox', { name: /AM skincare/ });
  await expect(am).toHaveAttribute('aria-checked', 'false');
  await am.click();
  await expect(am).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Routines')).toContainText('1/4');
  await page.getByRole('button', { name: 'Trained today ✓' }).click();
  await expect(page.getByLabel('Workout')).toContainText('Trained');
  await expect(page.getByLabel("Today's score")).toContainText('2 of 8 done');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: /AM skincare/ })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('link', { name: /Habits/ }).click();
  await page.getByRole('tab', { name: '▦ Grid' }).click();
  await expect(page.getByRole('button', { name: `AM skincare on ${today()}` })).toHaveAttribute('aria-pressed', 'true');
});

test('shows both countdowns with day counts', async ({ page }) => {
  await login(page);
  const card = page.getByLabel('Countdowns');
  await expect(card).toContainText('Diwali');
  await expect(card).toContainText('Engagement');
});
