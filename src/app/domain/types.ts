import type { Day } from '@shared/days';
import { DEFAULT_WINDOWS, type EatingWindow } from '@shared/windows';

export type { Day, EatingWindow };

export type Frequency = 'daily' | 'weekly';
export type HabitSource = 'manual' | 'steps' | 'calories' | 'workout' | 'fasting';
export type Slot = 'morning' | 'night' | 'anytime';
/** 'final' judges a day as finished; 'live' lets today's calories/fasting count while on track. */
export type Mode = 'final' | 'live';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: Frequency;
  source: HabitSource;
  slot: Slot;
  weekday: number | null;
  sortOrder: number;
  createdDay: Day;
  archivedDay: Day | null;
}

export interface Countdown {
  id: string;
  title: string;
  emoji: string;
  targetDate: Day;
  createdDay: Day;
}

export interface Challenge {
  id: string;
  countdownId: string;
  habitId: string;
  targetDays: number;
  startDay: Day;
}

export interface Goals {
  stepGoal: number;
  kcalGoal: number;
  fastingEnabled: boolean;
  windows: readonly EatingWindow[];
}

export interface Workout {
  id: string;
  startedAt: string;
  day: Day;
  durationMin: number | null;
  name: string | null;
  source: 'health' | 'manual';
}

export interface FoodDay {
  kcal: number;
  protein: number;
  entries: number;
  /** IST clock minute of each entry. */
  minutes: readonly number[];
}

export interface History {
  checks: ReadonlyMap<string, ReadonlySet<Day>>;
  steps: ReadonlyMap<Day, number>;
  workouts: ReadonlyMap<Day, readonly Workout[]>;
  food: ReadonlyMap<Day, FoodDay>;
}

export interface Ctx {
  history: History;
  goals: Goals;
  today: Day;
}

export const EMPTY_HISTORY: History = { checks: new Map(), steps: new Map(), workouts: new Map(), food: new Map() };

export const DEFAULT_GOALS: Goals = { stepGoal: 10_000, kcalGoal: 2_000, fastingEnabled: true, windows: DEFAULT_WINDOWS };
