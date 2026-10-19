import { expect, test } from '@playwright/test';
import { addDays } from '../supabase/functions/_shared/days';
import { dayLabel } from '../src/app/core/format';
import { login, resetTestUser, today } from './helpers';

test.beforeEach(resetTestUser);

test('Dermarolling is highlighted on its due day, and Done moves it 4 days on', async ({ page }) => {
  await login(page);
  const card = page.getByRole('region', { name: 'Dermarolling is due' });
  await expect(card).toContainText('Due today');
  // The tick shows at once; wait for the server to store it before reloading.
  const saved = page.waitForResponse((r) => r.url().includes('/rest/v1/habit_checks') && r.request().method() === 'POST');
  await card.getByRole('button', { name: 'Done ✓' }).click();
  await saved;
  await expect(card).toHaveCount(0);
  const routines = page.getByLabel('Routines');
  await expect(routines).toContainText(`Dermarolling done · next ${dayLabel(addDays(today(), 4))}`);
  await page.reload();
  await expect(routines).toContainText(`next ${dayLabel(addDays(today(), 4))}`);
});
