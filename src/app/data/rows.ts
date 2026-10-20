import { appDayOf } from '@shared/days';
import type { EatingWindow } from '@shared/windows';
import type { Challenge, Countdown, Goals, Habit, Workout } from '../domain/types';

export interface SettingsRow {
  step_goal: number;
  kcal_goal: number;
  last_sync_at: string | null;
  sync_token_hash: string | null;
  fasting_enabled: boolean;
  eating_windows: EatingWindow[];
}

export interface HabitRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: Habit['frequency'];
  source: Habit['source'];
  slot: Habit['slot'];
  weekday: number | null;
  interval_days: number | null;
  interval_start: string | null;
  times_per_week: number | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface CountdownRow { id: string; title: string; emoji: string; target_date: string; created_at: string }
export interface ChallengeRow { id: string; countdown_id: string; habit_id: string; target_days: number; start_day: string }
export interface WorkoutRow { id: string; started_at: string; day: string; duration_min: number | null; name: string | null; source: Workout['source'] }
export interface FoodEntryRow { id: string; eaten_at: string; day: string; name: string; kcal: number; protein_g: number | null; saved_food_id: string | null }
export interface SavedFoodRow { id: string; name: string; kcal: number; protein_g: number | null; use_count: number }
export interface TaskRow { id: string; title: string; month: string; done_at: string | null }
export interface CheckRow { habit_id: string; day: string }
export interface StepsRow { day: string; count: number }

export const toGoals = (r: SettingsRow): Goals => ({
  stepGoal: r.step_goal, kcalGoal: r.kcal_goal, fastingEnabled: r.fasting_enabled, windows: r.eating_windows,
});

export const toHabit = (r: HabitRow): Habit => ({
  id: r.id, name: r.name, emoji: r.emoji, color: r.color, frequency: r.frequency, source: r.source, slot: r.slot,
  weekday: r.weekday, intervalDays: r.interval_days, intervalStart: r.interval_start, timesPerWeek: r.times_per_week, sortOrder: r.sort_order,
  createdDay: appDayOf(new Date(r.created_at)),
  archivedDay: r.archived_at ? appDayOf(new Date(r.archived_at)) : null,
});

export const toCountdown = (r: CountdownRow): Countdown => ({
  id: r.id, title: r.title, emoji: r.emoji, targetDate: r.target_date, createdDay: appDayOf(new Date(r.created_at)),
});

export const toChallenge = (r: ChallengeRow): Challenge => ({
  id: r.id, countdownId: r.countdown_id, habitId: r.habit_id, targetDays: r.target_days, startDay: r.start_day,
});

export const toWorkout = (r: WorkoutRow): Workout => ({
  id: r.id, startedAt: r.started_at, day: r.day, durationMin: r.duration_min, name: r.name, source: r.source,
});
