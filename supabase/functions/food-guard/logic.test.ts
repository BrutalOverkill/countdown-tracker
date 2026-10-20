import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOWS } from '../_shared/windows.ts';
import { guardResult } from './logic.ts';

const base = { goal: 2000, fastingEnabled: true, windows: DEFAULT_WINDOWS };

describe('guardResult', () => {
  it('lets you in under target inside a window, with no message for the Shortcut to act on', () => {
    // The Shortcut bounces you whenever "message" has any value, so an allowed answer must not carry one at all.
    expect(JSON.parse(JSON.stringify(guardResult({ ...base, kcal: 1200, minute: 700 })))).toStrictEqual({
      kcal: 1200, goal: 2000, reached: false, fasting: false, nextWindow: '12:00 AM', blocked: false,
    });
  });

  it('blocks at exactly the target and above', () => {
    expect(guardResult({ ...base, kcal: 2000, minute: 700 })).toMatchObject({ reached: true, blocked: true, message: "🛑 2,000 kcal today — target hit. Kitchen's closed." });
    expect(guardResult({ ...base, kcal: 2050, minute: 700 }).message).toBe("🛑 2,050 kcal today — target hit. Kitchen's closed.");
  });

  it('blocks outside the windows even with nothing logged', () => {
    expect(guardResult({ ...base, kcal: 0, minute: 840 })).toEqual({
      kcal: 0, goal: 2000, reached: false, fasting: true, nextWindow: '12:00 AM', blocked: true, message: '🌙 Fasting — next window opens at 12:00 AM.',
    });
    expect(guardResult({ ...base, kcal: 0, minute: 120 }).message).toBe('🌙 Fasting — next window opens at 11:00 AM.');
  });

  it('ignores the windows when fasting is off or there are none', () => {
    expect(guardResult({ ...base, fastingEnabled: false, kcal: 0, minute: 840 })).toMatchObject({ fasting: false, blocked: false, nextWindow: null });
    expect(guardResult({ ...base, windows: [], kcal: 0, minute: 840 })).toMatchObject({ fasting: false, blocked: false, nextWindow: null });
  });

  it('shows the target message when both reasons apply', () => {
    expect(guardResult({ ...base, kcal: 2100, minute: 840 })).toMatchObject({ reached: true, fasting: true, blocked: true, message: "🛑 2,100 kcal today — target hit. Kitchen's closed." });
  });
});
