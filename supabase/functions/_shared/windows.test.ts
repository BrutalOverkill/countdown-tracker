import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOWS, fastState, formatClock, inWindow, nextStartAfter, validateWindows, windowAt } from './windows.ts';

const W = DEFAULT_WINDOWS; // 00:00–01:00 and 11:00–13:00

describe('eating windows', () => {
  it('treats start as inside and end as outside', () => {
    expect(inWindow(0, W)).toBe(true);
    expect(inWindow(59, W)).toBe(true);
    expect(inWindow(60, W)).toBe(false);
    expect(inWindow(660, W)).toBe(true);
    expect(inWindow(779, W)).toBe(true);
    expect(inWindow(780, W)).toBe(false);
    expect(windowAt(700, W)).toEqual({ start: '11:00', end: '13:00' });
    expect(inWindow(700, [])).toBe(false);
  });

  it('formats clock minutes as h:mm AM/PM', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(660)).toBe('11:00 AM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(780)).toBe('1:00 PM');
    expect(formatClock(1439)).toBe('11:59 PM');
    expect(formatClock(1440)).toBe('12:00 AM');
  });

  it('finds the next window start, wrapping to tomorrow', () => {
    expect(nextStartAfter(120, W)).toBe(660);
    expect(nextStartAfter(0, W)).toBe(660);
    expect(nextStartAfter(700, W)).toBe(1440);
  });

  it('describes an open window', () => {
    expect(fastState(690, W)).toEqual({ kind: 'open', window: { start: '11:00', end: '13:00' }, minutesLeft: 90, fraction: 0.25 });
  });

  it('describes the afternoon fast (1 PM → midnight)', () => {
    expect(fastState(840, W)).toEqual({ kind: 'fasting', nextStart: 0, minutesUntilNext: 600, fastMinutes: 660, doneMinutes: 60, fraction: 60 / 660 });
  });

  it('describes the early-morning fast (1 AM → 11 AM)', () => {
    expect(fastState(120, W)).toEqual({ kind: 'fasting', nextStart: 660, minutesUntilNext: 540, fastMinutes: 600, doneMinutes: 60, fraction: 0.1 });
  });

  it('has no state without windows', () => {
    expect(fastState(600, [])).toBeNull();
  });

  it('validates windows', () => {
    expect(validateWindows(W)).toBeNull();
    expect(validateWindows([])).toBe('Add 1 to 3 eating windows');
    expect(validateWindows([...W, { start: '15:00', end: '16:00' }, { start: '18:00', end: '19:00' }])).toBe('Add 1 to 3 eating windows');
    expect(validateWindows([{ start: '9:00', end: '10:00' }])).toBe('Use 24-hour times like 11:00');
    expect(validateWindows([{ start: '13:00', end: '11:00' }])).toBe('A window must end after it starts, on the same day');
    expect(validateWindows([{ start: '11:00', end: '13:00' }, { start: '12:30', end: '14:00' }])).toBe("Windows can't overlap");
    expect(validateWindows([{ start: '11:00', end: '13:00' }, { start: '13:00', end: '14:00' }])).toBeNull();
  });
});
