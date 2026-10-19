import { describe, expect, it } from 'vitest';
import { messageFor, pendingFor, validatePayload } from './logic.ts';

const LATEST = '2026-10-20';

describe('validatePayload', () => {
  it('accepts a normal body', () => {
    const r = validatePayload({
      steps: [{ date: '2026-10-19', count: 7842 }],
      workouts: [{ start: '2026-10-19T18:02:00+05:30', durationMin: 52, name: 'Traditional Strength Training' }],
    }, LATEST);
    expect(r).toEqual({ ok: true, value: {
      steps: [{ date: '2026-10-19', count: 7842 }],
      workouts: [{ start: '2026-10-19T12:32:00.000Z', durationMin: 52, name: 'Traditional Strength Training' }],
    } });
  });

  it('coerces numeric strings and decimals and rounds them', () => {
    const r = validatePayload({ steps: [{ date: '2026-10-18', count: '7842' }, { date: '2026-10-19', count: 9120.6 }] }, LATEST);
    expect(r.ok && r.value.steps).toEqual([{ date: '2026-10-18', count: 7842 }, { date: '2026-10-19', count: 9121 }]);
  });

  it('treats a bare object as a one-item list', () => {
    const r = validatePayload({ steps: { date: '2026-10-19', count: 100 }, workouts: { start: '2026-10-19T10:00:00Z' } }, LATEST);
    expect(r.ok && r.value.steps).toEqual([{ date: '2026-10-19', count: 100 }]);
    expect(r.ok && r.value.workouts).toEqual([{ start: '2026-10-19T10:00:00.000Z', durationMin: null, name: null }]);
  });

  it('treats missing, null or empty-string lists as empty', () => {
    expect(validatePayload({}, LATEST)).toEqual({ ok: true, value: { steps: [], workouts: [] } });
    expect(validatePayload({ steps: null, workouts: '' }, LATEST)).toEqual({ ok: true, value: { steps: [], workouts: [] } });
  });

  it('keeps the last entry for a repeated date or start', () => {
    const r = validatePayload({
      steps: [{ date: '2026-10-19', count: 5 }, { date: '2026-10-19', count: 6 }],
      workouts: [{ start: '2026-10-19T10:00:00Z', name: 'A' }, { start: '2026-10-19T10:00:00Z', name: 'B' }],
    }, LATEST);
    expect(r.ok && r.value.steps).toEqual([{ date: '2026-10-19', count: 6 }]);
    expect(r.ok && r.value.workouts.map((w) => w.name)).toEqual(['B']);
  });

  it('accepts dates up to latestDay and 31 days back, no further', () => {
    expect(validatePayload({ steps: [{ date: '2026-10-20', count: 1 }, { date: '2026-09-19', count: 1 }] }, LATEST).ok).toBe(true);
    expect(validatePayload({ steps: [{ date: '2026-10-21', count: 1 }] }, LATEST)).toEqual({ ok: false, error: 'steps[0].date must be a recent date (yyyy-MM-dd)' });
    expect(validatePayload({ steps: [{ date: '2026-09-18', count: 1 }] }, LATEST).ok).toBe(false);
  });

  it('rejects bad bodies with a clear message', () => {
    expect(validatePayload([], LATEST)).toEqual({ ok: false, error: 'Body must be a JSON object' });
    expect(validatePayload('x', LATEST)).toEqual({ ok: false, error: 'Body must be a JSON object' });
    expect(validatePayload({ steps: 'abc' }, LATEST)).toEqual({ ok: false, error: 'steps must be a list of at most 31 days' });
    expect(validatePayload({ steps: [{ date: '2026-10-19', count: -1 }] }, LATEST)).toEqual({ ok: false, error: 'steps[0].count must be a number from 0 to 100000' });
    expect(validatePayload({ steps: [{ date: '2026-10-19', count: 100_001 }] }, LATEST).ok).toBe(false);
    expect(validatePayload({ steps: [{ date: '2026-10-19', count: 'many' }] }, LATEST).ok).toBe(false);
    expect(validatePayload({ steps: Array.from({ length: 32 }, () => ({ date: '2026-10-19', count: 1 })) }, LATEST).ok).toBe(false);
    expect(validatePayload({ workouts: [{ start: 'yesterday' }] }, LATEST)).toEqual({ ok: false, error: 'workouts[0].start must be a recent date-time' });
    expect(validatePayload({ workouts: [{ start: '2026-10-19T10:00:00Z', durationMin: 2000 }] }, LATEST)).toEqual({ ok: false, error: 'workouts[0].durationMin must be 0–1440' });
    expect(validatePayload({ workouts: Array.from({ length: 21 }, (_, i) => ({ start: `2026-10-19T10:${String(i).padStart(2, '0')}:00Z` })) }, LATEST)).toEqual({ ok: false, error: 'workouts must be a list of at most 20 items' });
  });

  it('cleans workout fields', () => {
    const r = validatePayload({ workouts: [{ start: '2026-10-19T10:00:00Z', durationMin: '45.4', name: '  ' + 'x'.repeat(100) }] }, LATEST);
    expect(r.ok && r.value.workouts[0]).toEqual({ start: '2026-10-19T10:00:00.000Z', durationMin: 45, name: 'x'.repeat(80) });
    const blank = validatePayload({ workouts: [{ start: '2026-10-19T10:00:00Z', durationMin: '', name: '' }] }, LATEST);
    expect(blank.ok && blank.value.workouts[0]).toEqual({ start: '2026-10-19T10:00:00.000Z', durationMin: null, name: null });
  });

  it('drops fields it does not know, including any user_id (ownership comes from the token)', () => {
    const r = validatePayload({ user_id: 'someone-else', steps: [{ date: '2026-10-19', count: 5, user_id: 'someone-else' }] }, LATEST);
    expect(r).toEqual({ ok: true, value: { steps: [{ date: '2026-10-19', count: 5 }], workouts: [] } });
  });
});

describe('pendingFor', () => {
  const daily = (name: string, sortOrder: number, checkedDays: string[] = []) => ({ name, frequency: 'daily' as const, weekday: null, sortOrder, checkedDays });

  it('lists unticked daily habits in sort order', () => {
    expect(pendingFor('2026-10-19', [daily('PM skincare', 6), daily('AM skincare', 5, ['2026-10-19']), daily('Minoxidil PM', 8)])).toEqual(['PM skincare', 'Minoxidil PM']);
  });

  it('nudges a weekly habit only on its weekday and only if not done in the week block', () => {
    const derma = (checkedDays: string[], weekday: number | null = 0) => ({ name: 'Dermarolling', frequency: 'weekly' as const, weekday, sortOrder: 9, checkedDays });
    expect(pendingFor('2026-10-18', [derma([])])).toEqual(['Dermarolling']); // Sunday, block 15–21
    expect(pendingFor('2026-10-18', [derma(['2026-10-15'])])).toEqual([]);
    expect(pendingFor('2026-10-18', [derma(['2026-10-14'])])).toEqual(['Dermarolling']); // previous block
    expect(pendingFor('2026-10-19', [derma([])])).toEqual([]); // Monday
    expect(pendingFor('2026-10-18', [derma([], null)])).toEqual([]);
  });
});

describe('messageFor', () => {
  it('builds the nudge text', () => {
    expect(messageFor(['PM skincare', 'Minoxidil PM'])).toBe('Left today: PM skincare, Minoxidil PM');
    expect(messageFor([])).toBe('');
  });
});
