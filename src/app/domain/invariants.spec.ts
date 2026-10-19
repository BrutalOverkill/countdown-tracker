import { addDays, eachDay } from '@shared/days';
import { challengeProgress } from './challenges';
import { buildReport } from './report';
import { dayScore, isGood } from './scoring';
import { overallStreak } from './streaks';
import { ctx, habit, history } from './testing';
import type { Challenge, Countdown, Habit } from './types';

// Seeded LCG so a failing case can be replayed from its seed.
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function randomCase(seed: number) {
  const r = rng(seed);
  const today = addDays('2026-10-01', Math.floor(r() * 60));
  const sources = ['manual', 'manual', 'steps', 'calories', 'workout', 'fasting'] as const;
  const habits: Habit[] = Array.from({ length: 1 + Math.floor(r() * 7) }, (_, i) =>
    habit(`h${i}`, {
      source: sources[Math.floor(r() * sources.length)],
      frequency: r() < 0.15 ? 'weekly' : 'daily',
      sortOrder: i,
      createdDay: addDays('2026-09-01', Math.floor(r() * 40)),
      archivedDay: r() < 0.2 ? addDays('2026-09-20', Math.floor(r() * 50)) : null,
    }),
  );
  const days = eachDay('2026-09-01', today);
  const some = () => days.filter(() => r() < 0.6);
  const h = history({
    checks: Object.fromEntries(habits.map((x) => [x.id, some()])),
    steps: Object.fromEntries(some().map((d) => [d, Math.floor(r() * 20_000)])),
    workouts: some(),
    food: Object.fromEntries(some().map((d) => [d, { kcal: Math.floor(r() * 4000), minutes: [Math.floor(r() * 1440)] }])),
  });
  return { today, habits, days, c: ctx(today, h) };
}

const cases = Array.from({ length: 200 }, (_, i) => randomCase(i + 1));

describe('domain invariants (200 seeded random histories)', () => {
  it('scores are whole numbers from 0 to 100 and never NaN', () => {
    for (const { habits, days, c } of cases) {
      for (const d of days) {
        const s = dayScore(habits, d, c);
        expect(Number.isInteger(s.score)).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(s.done).toBeLessThanOrEqual(s.total);
      }
    }
  });

  it('streaks are bounded and frozen days are never good days', () => {
    for (const { habits, days, c } of cases) {
      const s = overallStreak(habits, c);
      expect(s.length).toBeGreaterThanOrEqual(0);
      expect(s.length).toBeLessThanOrEqual(days.length);
      for (const d of s.frozen) expect(isGood(dayScore(habits, d, c))).toBe(false);
    }
  });

  it('archived habits never count on or after their archive day', () => {
    for (const { habits, days, c } of cases) {
      for (const h of habits.filter((x) => x.archivedDay !== null)) {
        const without = habits.filter((x) => x !== h);
        for (const d of days.filter((x) => x >= h.archivedDay!)) expect(dayScore(habits, d, c)).toEqual(dayScore(without, d, c));
      }
    }
  });

  it('challenge progress stays inside its window (done may pass the target, never the window)', () => {
    for (const { habits, today, c } of cases) {
      const cd: Countdown = { id: 'cd', title: 'T', emoji: '🎯', targetDate: addDays(today, 5), createdDay: addDays(today, -20) };
      const ch: Challenge = { id: 'ch', countdownId: 'cd', habitId: habits[0].id, targetDays: 10, startDay: addDays(today, -20) };
      const p = challengeProgress(ch, habits[0], cd, c);
      expect(p.done).toBeLessThanOrEqual(p.window);
      expect(p.elapsed + p.left).toBeLessThanOrEqual(p.window);
      expect(p.pace).toBeGreaterThanOrEqual(0);
      expect(p.pace).toBeLessThanOrEqual(1);
    }
  });

  it('a report is identical for identical inputs', () => {
    for (const { habits, today, c } of cases.slice(0, 50)) {
      const cd: Countdown = { id: 'cd', title: 'T', emoji: '🎯', targetDate: today, createdDay: '2026-09-10' };
      expect(buildReport(cd, habits, [], c)).toEqual(buildReport(cd, habits, [], c));
    }
  });

  it('records dated in the future never change past scores', () => {
    for (const { habits, today, days, c } of cases.slice(0, 50)) {
      const future = { ...c, history: { ...c.history, steps: new Map([...c.history.steps, [addDays(today, 3), 50_000]]) } };
      for (const d of days) expect(dayScore(habits, d, future)).toEqual(dayScore(habits, d, c));
    }
  });
});
