import { eachDay } from '@shared/days';
import { ctx, habit, history } from './testing';
import { buildReport, gradeFor } from './report';
import type { Countdown } from './types';

describe('gradeFor', () => {
  it('maps averages to grades at the boundaries', () => {
    expect([90, 89, 80, 79, 70, 69, 60, 59].map(gradeFor)).toEqual(['A+', 'A', 'A', 'B', 'B', 'C', 'C', 'D']);
  });
});

describe('buildReport', () => {
  // Countdown created Thu 1 Oct, due Sun 11 Oct → period 1–10 Oct (10 days). Viewed on the 11th.
  const cd: Countdown = { id: 'cd', title: 'Test', emoji: '🎯', targetDate: '2026-10-11', createdDay: '2026-10-01' };
  const habits = [habit('a', { sortOrder: 1, color: '#A3F53B' }), habit('s', { source: 'steps', sortOrder: 0 })];
  const h = history({
    checks: { a: eachDay('2026-10-01', '2026-10-10') },
    steps: {
      ...Object.fromEntries(eachDay('2026-10-01', '2026-10-05').map((d) => [d, 12_000])),
      ...Object.fromEntries(eachDay('2026-10-06', '2026-10-10').map((d) => [d, 5_000])),
    },
  });

  it('summarises the run-up', () => {
    const r = buildReport(cd, habits, [{ id: 'ch', countdownId: 'cd', habitId: 'a', targetDays: 8, startDay: '2026-10-01' }], ctx('2026-10-11', h));
    expect(r).toMatchObject({
      from: '2026-10-01', to: '2026-10-10', days: 10,
      avgScore: 75, grade: 'B',
      bestWeek: { from: '2026-10-01', to: '2026-10-07', avg: 86 },
      perfectDays: 5, bestStreak: 5, workoutDays: 0,
      totalSteps: 85_000, avgSteps: 8_500, kcalDays: 0,
    });
    expect(r.challenges).toEqual([{ id: 'ch', habitName: 'a', done: 10, target: 8, won: true }]);
    expect(r.habits).toEqual([{ id: 'a', name: 'a', color: '#A3F53B', percent: 100 }]);
  });

  it('has nothing to report for a countdown created on its own date', () => {
    const same: Countdown = { ...cd, createdDay: '2026-10-11' };
    const r = buildReport(same, habits, [], ctx('2026-10-11', h));
    expect(r).toMatchObject({ days: 0, avgScore: null, grade: null, bestWeek: null, perfectDays: 0 });
  });

  it('skips the best week when the period is shorter than 7 days', () => {
    const short: Countdown = { ...cd, createdDay: '2026-10-07' };
    expect(buildReport(short, habits, [], ctx('2026-10-11', h)).bestWeek).toBeNull();
  });
});
