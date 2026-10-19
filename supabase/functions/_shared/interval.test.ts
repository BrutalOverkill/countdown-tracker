import { describe, expect, it } from 'vitest';
import { isDueOn, nextDueOn } from './interval.ts';

const start = '2026-10-20';

describe('interval habits', () => {
  it('is first due on its start day', () => {
    expect(nextDueOn('2026-10-20', start, 4, [])).toBe('2026-10-20');
    expect(isDueOn('2026-10-19', start, 4, [])).toBe(false);
    expect(isDueOn('2026-10-20', start, 4, [])).toBe(true);
  });

  it('is next due N days after the last tick and stays due until ticked', () => {
    const ticks = ['2026-10-20'];
    expect(nextDueOn('2026-10-21', start, 4, ticks)).toBe('2026-10-24');
    expect(isDueOn('2026-10-23', start, 4, ticks)).toBe(false);
    expect(isDueOn('2026-10-24', start, 4, ticks)).toBe(true);
    expect(isDueOn('2026-11-02', start, 4, ticks)).toBe(true);
  });

  it('counts from the day it was actually done, across months', () => {
    expect(nextDueOn('2026-10-27', start, 4, ['2026-10-20', '2026-10-26'])).toBe('2026-10-30');
    expect(nextDueOn('2026-11-01', start, 4, ['2026-10-30'])).toBe('2026-11-03');
  });

  it("keeps a day due when it's ticked that same day", () => {
    expect(isDueOn('2026-10-24', start, 4, ['2026-10-20', '2026-10-24'])).toBe(true);
  });

  it('ignores ticks before the start', () => {
    expect(nextDueOn('2026-10-21', start, 4, ['2026-10-18'])).toBe('2026-10-20');
  });
});
