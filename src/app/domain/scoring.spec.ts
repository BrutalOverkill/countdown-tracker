import { ctx, habit, history } from './testing';
import { dayScore, habitDone, isGood, isPerfect, weekProgress } from './scoring';

const T = '2026-10-20';
const Y = '2026-10-19';
const steps = habit('steps', { source: 'steps' });
const cal = habit('cal', { source: 'calories' });
const fast = habit('fast', { source: 'fasting' });
const gym = habit('gym', { source: 'workout' });
const skin = habit('skin');

describe('habitDone', () => {
  it('steps: done at the goal, not below', () => {
    expect(habitDone(steps, Y, ctx(T, history({ steps: { [Y]: 10_000 } })))).toBe(true);
    expect(habitDone(steps, Y, ctx(T, history({ steps: { [Y]: 9_999 } })))).toBe(false);
  });

  it('workout: any workout that day', () => {
    expect(habitDone(gym, Y, ctx(T, history({ workouts: [Y] })))).toBe(true);
    expect(habitDone(gym, Y, ctx(T))).toBe(false);
  });

  it('manual: a tick that day', () => {
    expect(habitDone(skin, Y, ctx(T, history({ checks: { skin: [Y] } })))).toBe(true);
    expect(habitDone(skin, T, ctx(T, history({ checks: { skin: [Y] } })))).toBe(false);
  });

  it('calories: past day logged and within target', () => {
    expect(habitDone(cal, Y, ctx(T, history({ food: { [Y]: { kcal: 2_000 } } })))).toBe(true);
    expect(habitDone(cal, Y, ctx(T, history({ food: { [Y]: { kcal: 2_001 } } })))).toBe(false);
    expect(habitDone(cal, Y, ctx(T))).toBe(false);
  });

  it('calories today: empty when final, on track when live', () => {
    const c = ctx(T, history({ food: { [T]: { kcal: 900 } } }));
    expect(habitDone(cal, T, c, 'final')).toBe(false);
    expect(habitDone(cal, T, c, 'live')).toBe(true);
  });

  it('fasting: every entry inside a window, at least one entry', () => {
    expect(habitDone(fast, Y, ctx(T, history({ food: { [Y]: { kcal: 1_500, minutes: [30, 700] } } })))).toBe(true);
    expect(habitDone(fast, Y, ctx(T, history({ food: { [Y]: { kcal: 1_500, minutes: [30, 900] } } })))).toBe(false);
    expect(habitDone(fast, Y, ctx(T))).toBe(false);
  });

  it('fasting today: live only', () => {
    const c = ctx(T, history({ food: { [T]: { kcal: 600, minutes: [700] } } }));
    expect(habitDone(fast, T, c, 'final')).toBe(false);
    expect(habitDone(fast, T, c, 'live')).toBe(true);
  });

  it('is never done on a future day', () => {
    expect(habitDone(skin, '2026-10-21', ctx(T, history({ checks: { skin: ['2026-10-21'] } })))).toBe(false);
  });
});

describe('dayScore', () => {
  it('scores done ÷ active daily habits, ignoring weekly and archived ones', () => {
    const habits = [habit('a'), habit('b'), habit('c'), habit('d'), habit('w', { frequency: 'weekly' }), habit('x', { archivedDay: Y })];
    const c = ctx(T, history({ checks: { a: [T], b: [T], c: [T], w: [T], x: [T] } }));
    expect(dayScore(habits, T, c)).toEqual({ done: 3, total: 4, score: 75 });
  });

  it('is 0, not NaN, with no habits', () => {
    const s = dayScore([], T, ctx(T));
    expect(s).toEqual({ done: 0, total: 0, score: 0 });
    expect(isPerfect(s)).toBe(false);
    expect(isGood(s)).toBe(false);
  });

  it('uses the live rule for today', () => {
    const c = ctx(T, history({ food: { [T]: { kcal: 900 } } }));
    expect(dayScore([cal], T, c).score).toBe(100);
  });

  it('marks good (≥ 80) and perfect (100) days', () => {
    expect(isGood({ done: 4, total: 5, score: 80 })).toBe(true);
    expect(isPerfect({ done: 4, total: 5, score: 80 })).toBe(false);
    expect(isPerfect({ done: 5, total: 5, score: 100 })).toBe(true);
    expect(isGood({ done: 7, total: 8, score: 88 })).toBe(true);
    expect(isGood({ done: 6, total: 8, score: 75 })).toBe(false);
  });

  it('counts an every-4-days habit only while it is due, until it is ticked', () => {
    const daily = habit('a');
    const derma = habit('d', { frequency: 'interval', intervalDays: 4, intervalStart: '2026-10-20' });
    const c = ctx('2026-10-30', history({ checks: { a: ['2026-10-20', '2026-10-22', '2026-10-25'], d: ['2026-10-20'] } }));
    expect(dayScore([daily, derma], '2026-10-20', c)).toMatchObject({ done: 2, total: 2 });
    expect(dayScore([daily, derma], '2026-10-22', c)).toMatchObject({ done: 1, total: 1 });
    expect(dayScore([daily, derma], '2026-10-25', c)).toMatchObject({ done: 1, total: 2 });
  });
});

describe('times-a-week habits', () => {
  const gym = habit('gym', { source: 'workout', frequency: 'times_per_week', timesPerWeek: 4 });
  // Week of Mon 19 – Sun 25 Oct 2026.
  const trained = (days: string[]) => ctx('2026-10-26', history({ workouts: days }));

  it('is needed only when the week cannot reach the target without that day', () => {
    const c = trained(['2026-10-19', '2026-10-21']);
    expect(weekProgress(gym, '2026-10-22', c)).toEqual({ done: 2, target: 4, needed: false, reachable: true });
    expect(weekProgress(gym, '2026-10-24', c)).toEqual({ done: 2, target: 4, needed: true, reachable: true });
    expect(weekProgress(gym, '2026-10-25', trained(['2026-10-19', '2026-10-21', '2026-10-24'])).needed).toBe(true);
  });

  it('stops being needed once the target is reached, and restarts on Monday', () => {
    const c = trained(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
    expect(weekProgress(gym, '2026-10-25', c)).toEqual({ done: 4, target: 4, needed: false, reachable: true });
    expect(weekProgress(gym, '2026-10-26', trained(['2026-10-19'])).done).toBe(0);
  });

  it('says when the target can no longer be reached this week', () => {
    expect(weekProgress(gym, '2026-10-23', trained([]))).toEqual({ done: 0, target: 4, needed: true, reachable: false });
  });

  it('counts a week that spans two months', () => {
    expect(weekProgress(gym, '2026-11-01', ctx('2026-11-02', history({ workouts: ['2026-10-26', '2026-10-31'] }))).done).toBe(2);
  });

  it('scores it on training days and needed days only, so a rest day keeps a Perfect Day possible', () => {
    const am = habit('am');
    const c = ctx('2026-10-26', history({ workouts: ['2026-10-19'], checks: { am: ['2026-10-20', '2026-10-24'] } }));
    expect(dayScore([am, gym], '2026-10-19', c)).toMatchObject({ total: 2 });
    expect(dayScore([am, gym], '2026-10-20', c)).toMatchObject({ done: 1, total: 1 });
    expect(dayScore([am, gym], '2026-10-24', c)).toMatchObject({ done: 1, total: 2 });
  });
});
