import { buildHistory, mergeHistory, withCheck, withFoodDay } from './history';

const rows = {
  checks: [{ habit_id: 'a', day: '2026-10-19' }, { habit_id: 'a', day: '2026-10-20' }, { habit_id: 'b', day: '2026-10-20' }],
  steps: [{ day: '2026-10-19', count: 7842 }],
  workouts: [{ id: 'w1', started_at: '2026-10-19T12:32:00Z', day: '2026-10-19', duration_min: 52, name: 'Strength', source: 'health' as const }],
  food: [
    { day: '2026-10-19', kcal: 500, protein_g: 20, eaten_at: '2026-10-19T06:00:00Z' },
    { day: '2026-10-19', kcal: 700, protein_g: null, eaten_at: '2026-10-19T19:00:00Z' },
  ],
};

describe('history', () => {
  it('groups rows by habit and day', () => {
    const h = buildHistory(rows);
    expect([...(h.checks.get('a') ?? [])]).toEqual(['2026-10-19', '2026-10-20']);
    expect(h.steps.get('2026-10-19')).toBe(7842);
    expect(h.workouts.get('2026-10-19')?.[0]).toMatchObject({ id: 'w1', durationMin: 52, source: 'health' });
    expect(h.food.get('2026-10-19')).toEqual({ kcal: 1200, protein: 20, entries: 2, minutes: [690, 30] });
  });

  it('updates checks without mutating the original', () => {
    const h = buildHistory(rows);
    const off = withCheck(h, 'a', '2026-10-20', false);
    expect(off.checks.get('a')?.has('2026-10-20')).toBe(false);
    expect(h.checks.get('a')?.has('2026-10-20')).toBe(true);
    expect(withCheck(h, 'c', '2026-10-20', true).checks.get('c')?.has('2026-10-20')).toBe(true);
  });

  it('replaces or clears a food day', () => {
    const h = buildHistory(rows);
    expect(withFoodDay(h, '2026-10-19', null).food.has('2026-10-19')).toBe(false);
    expect(withFoodDay(h, '2026-10-20', { kcal: 1, protein: 0, entries: 1, minutes: [700] }).food.get('2026-10-20')?.kcal).toBe(1);
  });

  it('merges older history under newer', () => {
    const older = buildHistory({ ...rows, checks: [{ habit_id: 'a', day: '2026-09-01' }], steps: [{ day: '2026-10-19', count: 1 }] });
    const merged = mergeHistory(older, buildHistory(rows));
    expect([...(merged.checks.get('a') ?? [])].sort()).toEqual(['2026-09-01', '2026-10-19', '2026-10-20']);
    expect(merged.steps.get('2026-10-19')).toBe(7842);
  });
});
