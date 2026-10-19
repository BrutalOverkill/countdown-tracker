import { daysBetween, isValidDay, type Day } from '@shared/days';
import type { Frequency, Slot } from '../../domain/types';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// Postgres counts code points, so trim emoji by code point rather than UTF-16 unit.
const firstChars = (s: string, n: number) => [...s.trim()].slice(0, n).join('');

export function parseCountdown(f: { title: string; emoji: string; date: string }, today: Day): Parsed<{ title: string; emoji: string; targetDate: Day }> {
  const title = f.title.trim();
  if (!title || title.length > 40) return { ok: false, error: 'Give it a name (up to 40 characters)' };
  if (!isValidDay(f.date)) return { ok: false, error: 'Pick a date' };
  if (f.date < today) return { ok: false, error: 'Pick today or a future date' };
  return { ok: true, value: { title, emoji: firstChars(f.emoji, 8) || '🎯', targetDate: f.date } };
}

export function parseTargets(f: { steps: string; kcal: string }): Parsed<{ stepGoal: number; kcalGoal: number }> {
  const stepGoal = Number(f.steps);
  const kcalGoal = Number(f.kcal);
  if (!Number.isInteger(stepGoal) || stepGoal < 1000 || stepGoal > 100_000) return { ok: false, error: 'Step goal must be 1,000–100,000' };
  if (!Number.isInteger(kcalGoal) || kcalGoal < 500 || kcalGoal > 10_000) return { ok: false, error: 'Calorie goal must be 500–10,000' };
  return { ok: true, value: { stepGoal, kcalGoal } };
}

export interface HabitForm { name: string; emoji: string; frequency: Frequency; slot: Slot; weekday: string; intervalDays: string }

export function parseHabit(f: HabitForm): Parsed<{ name: string; emoji: string; frequency: Frequency; slot: Slot; weekday: number | null; intervalDays: number | null }> {
  const name = f.name.trim();
  if (!name || name.length > 40) return { ok: false, error: 'Give the habit a name (up to 40 characters)' };
  let intervalDays: number | null = null;
  if (f.frequency === 'interval') {
    intervalDays = Number(f.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 2 || intervalDays > 30) return { ok: false, error: 'Pick every 2–30 days' };
  }
  return {
    ok: true,
    value: { name, emoji: firstChars(f.emoji, 8) || '✅', frequency: f.frequency, slot: f.slot, weekday: f.frequency === 'weekly' ? Number(f.weekday || 0) : null, intervalDays },
  };
}

/** Days from today up to (not including) the countdown date — a new challenge's window. */
export function daysLeft(targetDate: Day, today: Day): number {
  return Math.max(0, daysBetween(today, targetDate));
}

export function parseChallengeTarget(raw: string, left: number): Parsed<number> {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > left) return { ok: false, error: `Pick 1–${left} days` };
  return { ok: true, value: n };
}

export function moved<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const out = [...list];
  [out[index], out[target]] = [out[target], out[index]];
  return out;
}
