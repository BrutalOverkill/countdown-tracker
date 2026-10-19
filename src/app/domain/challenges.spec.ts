import { eachDay } from '@shared/days';
import { ctx, habit, history } from './testing';
import { challengeProgress, defaultTarget } from './challenges';
import type { Challenge, Countdown, Day } from './types';

const diwali: Countdown = { id: 'cd', title: 'Diwali', emoji: '🪔', targetDate: '2026-11-08', createdDay: '2026-10-19' };
const steps = habit('steps', { source: 'steps' });
const cal = habit('cal', { source: 'calories' });
const c: Challenge = { id: 'ch', countdownId: 'cd', habitId: 'steps', targetDays: 15, startDay: '2026-10-19' };
const walked = (days: Day[]) => history({ steps: Object.fromEntries(days.map((d) => [d, 12_000])) });

describe('challengeProgress', () => {
  it('starts on track with the whole window ahead', () => {
    const p = challengeProgress(c, steps, diwali, ctx('2026-10-19'));
    expect(p).toMatchObject({ done: 0, window: 20, elapsed: 0, left: 20, status: 'on_track', pace: 0, endDay: '2026-11-07', finished: false });
  });

  it('compares done days with the pace a week in', () => {
    const six = walked(eachDay('2026-10-19', '2026-10-24'));
    expect(challengeProgress(c, steps, diwali, ctx('2026-10-26', six))).toMatchObject({ done: 6, elapsed: 7, left: 13, status: 'on_track', needed: 9 });
    const five = walked(eachDay('2026-10-19', '2026-10-23'));
    expect(challengeProgress(c, steps, diwali, ctx('2026-10-26', five)).status).toBe('behind');
  });

  it('is won once the target is reached', () => {
    expect(challengeProgress(c, steps, diwali, ctx('2026-11-03', walked(eachDay('2026-10-19', '2026-11-02')))).status).toBe('won');
  });

  it('is out of reach when the days left cannot make it', () => {
    expect(challengeProgress(c, steps, diwali, ctx('2026-11-05', walked(eachDay('2026-10-19', '2026-10-28')))).status).toBe('out_of_reach');
  });

  it('finishes after the window ends', () => {
    const won = challengeProgress(c, steps, diwali, ctx('2026-11-08', walked(eachDay('2026-10-19', '2026-11-03'))));
    expect(won).toMatchObject({ finished: true, status: 'won', done: 16, left: 0 });
    const missed = challengeProgress(c, steps, diwali, ctx('2026-11-08', walked(eachDay('2026-10-19', '2026-11-01'))));
    expect(missed).toMatchObject({ finished: true, status: 'out_of_reach', done: 14 });
  });

  it('ignores days outside the window', () => {
    const p = challengeProgress(c, steps, diwali, ctx('2026-11-09', walked(['2026-10-18', '2026-11-08'])));
    expect(p.done).toBe(0);
  });

  it("counts today's live calories while on track", () => {
    const calC: Challenge = { ...c, habitId: 'cal' };
    const h = history({ food: { '2026-10-26': { kcal: 900 } } });
    expect(challengeProgress(calC, cal, diwali, ctx('2026-10-26', h)).done).toBe(1);
  });
});

describe('defaultTarget', () => {
  it('suggests 75% of the days left, at least 1', () => {
    expect(defaultTarget(20)).toBe(15);
    expect(defaultTarget(3)).toBe(3);
    expect(defaultTarget(1)).toBe(1);
  });
});
