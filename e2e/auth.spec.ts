import { expect, test } from '@playwright/test';
import { login, resetTestUser } from './helpers';

test.beforeEach(resetTestUser);

test('rejects a wrong password, signs in, and signs out', async ({ page }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByPlaceholder('Email').fill('nobody@example.com');
  await page.getByPlaceholder('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText("Email or password didn't match");

  await login(page);
  await page.getByRole('checkbox', { name: /AM skincare/ }).click();
  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The previous session's data must be gone, not just hidden behind the login page.
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Today's score")).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /AM skincare/ })).toHaveCount(0);
});
