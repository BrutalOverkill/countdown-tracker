import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, appDayOf, appToday, daysBetween, eachDay, instantFor, isValidDay, isoWeekStart,
  istDayOf, istMinutesOf, monthEnd, monthStart, weekBlock, weekBlockRange, weekdayOf,
} from './days.ts';

describe('calendar and app days', () => {
  it('rolls the IST calendar day at 18:30 UTC (midnight IST)', () => {
    expect(istDayOf(new Date('2026-10-19T18:29:59Z'))).toBe('2026-10-19');
    expect(istDayOf(new Date('2026-10-19T18:30:00Z'))).toBe('2026-10-20');
  });

  it('rolls the app day at 4:00 AM IST (22:30 UTC)', () => {
    expect(appDayOf(new Date('2026-10-19T22:29:59Z'))).toBe('2026-10-19'); // 03:59:59 IST on the 20th
    expect(appDayOf(new Date('2026-10-19T22:30:00Z'))).toBe('2026-10-20'); // 04:00 IST
    expect(appToday(new Date('2026-10-19T19:00:00Z'))).toBe('2026-10-19'); // 00:30 IST: still the 19th
  });

  it('reads IST clock minutes', () => {
    expect(istMinutesOf(new Date('2026-10-19T18:30:00Z'))).toBe(0);
    expect(istMinutesOf(new Date('2026-10-19T05:30:00Z'))).toBe(660);
    expect(istMinutesOf(new Date('2026-10-19T18:29:00Z'))).toBe(1439);
  });

  it('turns an app day + clock time into an instant (early hours = next calendar date)', () => {
    expect(instantFor('2026-10-19', '12:15').toISOString()).toBe('2026-10-19T06:45:00.000Z');
    expect(instantFor('2026-10-19', '00:30').toISOString()).toBe('2026-10-19T19:00:00.000Z');
    expect(instantFor('2026-10-19', '03:59').toISOString()).toBe('2026-10-19T22:29:00.000Z');
    expect(instantFor('2026-10-19', '04:00').toISOString()).toBe('2026-10-18T22:30:00.000Z');
  });

  it('validates yyyy-MM-dd strings', () => {
    expect(isValidDay('2026-10-19')).toBe(true);
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2027-02-29')).toBe(false);
    expect(isValidDay('2028-02-29')).toBe(true);
    expect(isValidDay('2026-1-9')).toBe(false);
    expect(isValidDay(20261019)).toBe(false);
  });

  it('adds and diffs days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(daysBetween('2026-10-19', '2026-11-08')).toBe(20);
    expect(daysBetween('2026-10-19', '2026-12-10')).toBe(52);
    expect(daysBetween('2026-11-08', '2026-10-19')).toBe(-20);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('lists days inclusively', () => {
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(eachDay('2026-10-02', '2026-10-01')).toEqual([]);
  });

  it('knows weekdays and Monday week starts', () => {
    expect(weekdayOf('2026-10-18')).toBe(0);
    expect(weekdayOf('2026-11-08')).toBe(0);
    expect(weekdayOf('2026-10-19')).toBe(1);
    expect(isoWeekStart('2026-10-18')).toBe('2026-10-12');
    expect(isoWeekStart('2026-10-19')).toBe('2026-10-19');
  });

  it('finds month bounds and steps months', () => {
    expect(monthStart('2026-10-19')).toBe('2026-10-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(monthEnd('2026-10-05')).toBe('2026-10-31');
    expect(addMonths('2026-10-19', 1)).toBe('2026-11-01');
    expect(addMonths('2026-10-19', -1)).toBe('2026-09-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });

  it('splits a month into planner week blocks', () => {
    expect(weekBlock('2026-10-07')).toBe(1);
    expect(weekBlock('2026-10-08')).toBe(2);
    expect(weekBlock('2026-10-28')).toBe(4);
    expect(weekBlock('2026-10-29')).toBe(5);
    expect(weekBlock('2026-10-31')).toBe(5);
    expect(weekBlockRange('2026-10-19')).toEqual({ start: '2026-10-15', end: '2026-10-21' });
    expect(weekBlockRange('2026-10-30')).toEqual({ start: '2026-10-29', end: '2026-10-31' });
    expect(weekBlockRange('2026-02-28')).toEqual({ start: '2026-02-22', end: '2026-02-28' });
  });
});
