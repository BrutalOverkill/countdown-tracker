import { TestBed } from '@angular/core/testing';
import { Clock } from './clock';

describe('Clock', () => {
  afterEach(() => vi.useRealTimers());

  it('rolls today at 4:00 AM IST while the app stays open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T22:29:00Z')); // 03:59 IST on the 20th
    const clock = TestBed.inject(Clock);
    expect(clock.today()).toBe('2026-10-19');
    expect(clock.minute()).toBe(239);
    vi.advanceTimersByTime(60_000);
    expect(clock.today()).toBe('2026-10-20');
    expect(clock.minute()).toBe(240);
  });
});
