import { expect, test } from '@playwright/test';
import { login, pinClock, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('quick add, saved foods, the time field and outside-window flags', async ({ page }) => {
  await pinClock(page, today(), '12:10');
  await login(page);
  await page.getByRole('link', { name: /Food/ }).click();

  const form = page.getByLabel('Quick add');
  await form.getByPlaceholder('Food…').fill('Poha');
  await form.getByPlaceholder('kcal').fill('290');
  await form.getByRole('button', { name: '☆ save' }).click();
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('kcal-total')).toHaveText('290');
  await expect(page.getByLabel('Log')).toContainText('12:10 PM');

  await form.getByRole('button', { name: /Poha 290/ }).click();
  await expect(page.getByTestId('kcal-total')).toHaveText('580');

  await form.getByPlaceholder('Food…').fill('Samosa');
  await form.getByPlaceholder('kcal').fill('250');
  await form.locator('input[name=time]').fill('17:00');
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Log').locator('li', { hasText: 'Samosa' })).toContainText('⚠️');

  await page.getByRole('button', { name: 'Edit Samosa' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Tap again' }).click();
  await expect(page.getByLabel('Log')).not.toContainText('Samosa');
  await expect(page.getByTestId('kcal-total')).toHaveText('580');
});
