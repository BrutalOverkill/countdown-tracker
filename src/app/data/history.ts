import { istMinutesOf, type Day } from '@shared/days';
import type { FoodDay, History, Workout } from '../domain/types';
import { toWorkout, type CheckRow, type FoodEntryRow, type StepsRow, type WorkoutRow } from './rows';

export type FoodTotalsRow = Pick<FoodEntryRow, 'day' | 'kcal' | 'protein_g' | 'eaten_at'>;

export interface HistoryRows {
  checks: CheckRow[];
  steps: StepsRow[];
  workouts: WorkoutRow[];
  food: FoodTotalsRow[];
}

export function foodDayOf(entries: readonly Pick<FoodEntryRow, 'kcal' | 'protein_g' | 'eaten_at'>[]): FoodDay {
  return {
    kcal: entries.reduce((sum, e) => sum + e.kcal, 0),
    protein: entries.reduce((sum, e) => sum + (e.protein_g ?? 0), 0),
    entries: entries.length,
    minutes: entries.map((e) => istMinutesOf(new Date(e.eaten_at))),
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

export function buildHistory(rows: HistoryRows): History {
  return {
    checks: new Map([...groupBy(rows.checks, (c) => c.habit_id)].map(([id, list]) => [id, new Set(list.map((c) => c.day))])),
    steps: new Map(rows.steps.map((s) => [s.day, s.count])),
    workouts: new Map([...groupBy(rows.workouts, (w) => w.day)].map(([day, list]) => [day, list.map(toWorkout)])),
    food: new Map([...groupBy(rows.food, (f) => f.day)].map(([day, list]) => [day, foodDayOf(list)])),
  };
}

export function mergeHistory(older: History, newer: History): History {
  const checks = new Map<string, ReadonlySet<Day>>(older.checks);
  for (const [id, days] of newer.checks) checks.set(id, new Set([...(older.checks.get(id) ?? []), ...days]));
  return {
    checks,
    steps: new Map([...older.steps, ...newer.steps]),
    workouts: new Map([...older.workouts, ...newer.workouts]),
    food: new Map([...older.food, ...newer.food]),
  };
}

export function withCheck(h: History, habitId: string, day: Day, on: boolean): History {
  const days = new Set(h.checks.get(habitId) ?? []);
  if (on) days.add(day);
  else days.delete(day);
  return { ...h, checks: new Map(h.checks).set(habitId, days) };
}

export function withWorkouts(h: History, day: Day, list: readonly Workout[]): History {
  const workouts = new Map(h.workouts);
  if (list.length) workouts.set(day, list);
  else workouts.delete(day);
  return { ...h, workouts };
}

export function withFoodDay(h: History, day: Day, food: FoodDay | null): History {
  const map = new Map(h.food);
  if (food && food.entries > 0) map.set(day, food);
  else map.delete(day);
  return { ...h, food: map };
}
