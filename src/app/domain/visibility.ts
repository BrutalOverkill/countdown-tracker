import { monthEnd, monthStart } from '@shared/days';
import { isDueOn } from '@shared/interval';
import type { Day, Habit } from './types';

export function bySortOrder(a: Habit, b: Habit): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export function isActiveOn(h: Habit, day: Day): boolean {
  return h.createdDay <= day && (h.archivedDay === null || h.archivedDay > day);
}

/** An "every N days" habit that is due on `day` (spec §8.5). */
export function isDue(h: Habit, day: Day, checks: ReadonlySet<Day> = new Set()): boolean {
  return h.frequency === 'interval' && h.intervalDays !== null && h.intervalStart !== null && isActiveOn(h, day)
    && isDueOn(day, h.intervalStart, h.intervalDays, checks);
}

/** Habits that count in a day's score: active daily habits plus interval habits due that day (§8.1). */
export function scoredHabitsOn(habits: readonly Habit[], day: Day, checks: ReadonlyMap<string, ReadonlySet<Day>>): Habit[] {
  return habits.filter((h) => (h.frequency === 'daily' && isActiveOn(h, day)) || isDue(h, day, checks.get(h.id))).sort(bySortOrder);
}

export function habitsForMonth(habits: readonly Habit[], month: Day): Habit[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  return habits.filter((h) => h.createdDay <= last && (h.archivedDay === null || h.archivedDay >= first)).sort(bySortOrder);
}

export function firstHabitDay(habits: readonly Habit[]): Day | null {
  return habits.reduce<Day | null>((min, h) => (min === null || h.createdDay < min ? h.createdDay : min), null);
}
