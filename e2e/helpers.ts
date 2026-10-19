import { expect, type Page } from '@playwright/test';
import { env, resetUser, signIn } from '../scripts/live/env.mjs';
import { addDays, appToday } from '../supabase/functions/_shared/days';

export const today = () => appToday();
export const tomorrow = () => addDays(appToday(), 1);

/** Wipes the test user's data and re-seeds the defaults. */
export async function resetTestUser(): Promise<void> {
  const { db, userId } = await signIn();
  await resetUser(db, userId);
}

/**
 * Pins the app's clock (not the browser's) to an IST wall-clock time on a calendar day.
 * Faking the whole browser clock would make Supabase think every session token had expired.
 */
export async function pinClock(page: Page, day: string, hhmm: string): Promise<void> {
  const iso = new Date(`${day}T${hhmm}:00+05:30`).toISOString();
  const set = (value: string) => {
    (window as unknown as { __countdownNow?: string }).__countdownNow = value;
  };
  await page.addInitScript(set, iso);
  await page.evaluate(set, iso).catch(() => undefined);
}

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(env.email);
  await page.getByPlaceholder('Password').fill(env.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByLabel("Today's score")).toBeVisible();
}

/** Re-reads "now" after a pinned-clock change (the app's clock also ticks on visibilitychange). */
export async function nudgeClock(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}
