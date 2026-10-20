import { DEFAULT_GOALS, EMPTY_HISTORY, type Ctx, type Day, type Goals, type Habit, type History, type Workout } from './types';

export function habit(id: string, extra: Partial<Habit> = {}): Habit {
  return {
    id, name: id, emoji: '✅', color: '#FFFFFF', frequency: 'daily', source: 'manual', slot: 'anytime',
    weekday: null, intervalDays: null, intervalStart: null, timesPerWeek: null, sortOrder: 0, createdDay: '2026-10-01', archivedDay: null, ...extra,
  };
}

export interface HistorySpec {
  checks?: Record<string, Day[]>;
  steps?: Record<Day, number>;
  workouts?: Day[];
  /** minutes defaults to [720] (12:00, inside the 11–13 window). */
  food?: Record<Day, { kcal: number; protein?: number; minutes?: number[] }>;
}

export function history(spec: HistorySpec = {}): History {
  const workout = (day: Day): Workout => ({ id: `w-${day}`, startedAt: `${day}T12:00:00.000Z`, day, durationMin: 45, name: 'Strength', source: 'health' });
  return {
    checks: new Map(Object.entries(spec.checks ?? {}).map(([id, days]) => [id, new Set(days)])),
    steps: new Map(Object.entries(spec.steps ?? {})),
    workouts: new Map((spec.workouts ?? []).map((d) => [d, [workout(d)]])),
    food: new Map(Object.entries(spec.food ?? {}).map(([d, f]) => {
      const minutes = f.minutes ?? [720];
      return [d, { kcal: f.kcal, protein: f.protein ?? 0, entries: minutes.length, minutes }];
    })),
  };
}

export function ctx(today: Day, h: History = EMPTY_HISTORY, goals: Partial<Goals> = {}): Ctx {
  return { history: h, goals: { ...DEFAULT_GOALS, ...goals }, today };
}
