import { expect, test } from '@playwright/test';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('Auto picks Bento by day; ◐ overrides it and the override survives a reload', async ({ page }) => {
  await pinClock(page, today(), '14:00');
  await login(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'bento');
  await expect(page.getByLabel("Today's score")).toHaveAttribute('data-tone', 'lime');

  await page.getByRole('button', { name: 'Switch theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');
});

test('Auto picks Matrix at night, and Settings can pin a theme', async ({ page }) => {
  await pinClock(page, today(), '20:00');
  await login(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');

  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByRole('radio', { name: 'Bento' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'bento');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'bento');
});
