import { daysLeft, moved, parseChallengeTarget, parseCountdown, parseHabit, parseTargets } from './settings-forms';

describe('settings forms', () => {
  it('parses a countdown', () => {
    expect(parseCountdown({ title: ' Diwali ', emoji: '', date: '2026-11-08' }, '2026-10-19')).toEqual({ ok: true, value: { title: 'Diwali', emoji: '🎯', targetDate: '2026-11-08' } });
    expect(parseCountdown({ title: '', emoji: '🪔', date: '2026-11-08' }, '2026-10-19')).toEqual({ ok: false, error: 'Give it a name (up to 40 characters)' });
    expect(parseCountdown({ title: 'X', emoji: '', date: '' }, '2026-10-19')).toEqual({ ok: false, error: 'Pick a date' });
    expect(parseCountdown({ title: 'X', emoji: '', date: '2026-10-18' }, '2026-10-19')).toEqual({ ok: false, error: 'Pick today or a future date' });
  });

  it('parses targets within limits', () => {
    expect(parseTargets({ steps: '12000', kcal: '1800' })).toEqual({ ok: true, value: { stepGoal: 12000, kcalGoal: 1800 } });
    expect(parseTargets({ steps: '500', kcal: '1800' })).toEqual({ ok: false, error: 'Step goal must be 1,000–100,000' });
    expect(parseTargets({ steps: '10000', kcal: '20000' })).toEqual({ ok: false, error: 'Calorie goal must be 500–10,000' });
  });

  it('parses a habit, defaulting the emoji and the weekday', () => {
    expect(parseHabit({ name: ' Hair oil ', emoji: '', frequency: 'weekly', slot: 'night', weekday: '', intervalDays: '' })).toEqual({ ok: true, value: { name: 'Hair oil', emoji: '✅', frequency: 'weekly', slot: 'night', weekday: 0, intervalDays: null } });
    expect(parseHabit({ name: 'Water', emoji: '💧', frequency: 'daily', slot: 'anytime', weekday: '3', intervalDays: '' })).toMatchObject({ ok: true, value: { weekday: null } });
    expect(parseHabit({ name: ' ', emoji: '', frequency: 'daily', slot: 'anytime', weekday: '', intervalDays: '' })).toEqual({ ok: false, error: 'Give the habit a name (up to 40 characters)' });
  });

  it('bounds challenge targets by the days left', () => {
    expect(daysLeft('2026-11-08', '2026-10-19')).toBe(20);
    expect(daysLeft('2026-10-01', '2026-10-19')).toBe(0);
    expect(parseChallengeTarget('15', 20)).toEqual({ ok: true, value: 15 });
    expect(parseChallengeTarget('21', 20)).toEqual({ ok: false, error: 'Pick 1–20 days' });
    expect(parseChallengeTarget('0', 20).ok).toBe(false);
  });

  it('moves an item up or down', () => {
    expect(moved(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  it('parses an every-N-days habit and bounds N to 2–30', () => {
    expect(parseHabit({ name: 'Dermarolling', emoji: '🪡', frequency: 'interval', slot: 'night', weekday: '', intervalDays: '4' }))
      .toMatchObject({ ok: true, value: { frequency: 'interval', intervalDays: 4, weekday: null } });
    expect(parseHabit({ name: 'X', emoji: '', frequency: 'interval', slot: 'night', weekday: '', intervalDays: '1' })).toEqual({ ok: false, error: 'Pick every 2–30 days' });
    expect(parseHabit({ name: 'X', emoji: '', frequency: 'daily', slot: 'night', weekday: '', intervalDays: '4' })).toMatchObject({ ok: true, value: { intervalDays: null } });
  });
});
