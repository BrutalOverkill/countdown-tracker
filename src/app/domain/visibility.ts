import { monthEnd, monthStart } from '@shared/days';
import type { Day, Habit } from './types';

export function bySortOrder(a: Habit, b: Habit): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export function isActiveOn(h: Habit, day: Day): boolean {
  return h.createdDay <= day && (h.archivedDay === null || h.archivedDay > day);
}

export function dailyHabitsOn(habits: readonly Habit[], day: Day): Habit[] {
  return habits.filter((h) => h.frequency === 'daily' && isActiveOn(h, day)).sort(bySortOrder);
}

export function habitsForMonth(habits: readonly Habit[], month: Day): Habit[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  return habits.filter((h) => h.createdDay <= last && (h.archivedDay === null || h.archivedDay >= first)).sort(bySortOrder);
}

export function firstHabitDay(habits: readonly Habit[]): Day | null {
  return habits.reduce<Day | null>((min, h) => (min === null || h.createdDay < min ? h.createdDay : min), null);
}
