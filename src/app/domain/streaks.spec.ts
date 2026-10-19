import { eachDay } from '@shared/days';
import { ctx, habit, history } from './testing';
import { bestRun, longestStreak, overallStreak } from './streaks';
import type { Day } from './types';

// One daily habit since Thu 1 Oct 2026. Today is Thu 22 Oct (week Mon 19 – Sun 25).
const H = [habit('a', { createdDay: '2026-10-01' })];
const TODAY = '2026-10-22';
const doneUpTo = (to: Day, skip: Day[] = []) => history({ checks: { a: eachDay('2026-10-01', to).filter((d) => !skip.includes(d)) } });

describe('overallStreak', () => {
  it('counts good days up to yesterday, plus today once it is good', () => {
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21'))).length).toBe(21);
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-22'))).length).toBe(22);
  });

  it('freezes the first miss of a week without counting it', () => {
    const s = overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-20'])));
    expect(s.length).toBe(20);
    expect([...s.frozen]).toEqual(['2026-10-20']);
    expect(s.freezeAvailable).toBe(false);
  });

  it('breaks on the second miss in the same week (oldest miss gets the freeze)', () => {
    // Week Mon 12 – Sun 18: Tue 13 is frozen, Fri 16 breaks the streak.
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-13', '2026-10-16']))).length).toBe(5);
  });

  it('gives each week its own freeze (Sunday miss, then Monday miss)', () => {
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-18', '2026-10-19']))).length).toBe(19);
  });

  it('keeps the freeze available when this week has no misses', () => {
    expect(overallStreak(H, ctx(TODAY, doneUpTo('2026-10-21', ['2026-10-16']))).freezeAvailable).toBe(true);
  });

  it('is zero with no habits, freeze available', () => {
    expect(overallStreak([], ctx(TODAY))).toEqual({ length: 0, freezeAvailable: true, frozen: new Set() });
  });
});

describe('runs', () => {
  it('finds the longest run of true', () => {
    expect(bestRun([true, true, false, true, true, true, false])).toBe(3);
    expect(bestRun([])).toBe(0);
  });

  it('lets frozen days bridge a run without counting', () => {
    expect(longestStreak(['good', 'good', 'frozen', 'good', 'miss', 'good'])).toBe(3);
  });
});
