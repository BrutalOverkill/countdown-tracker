import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function start(at: Date): ThemeService {
    vi.setSystemTime(at);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  }

  it('applies Auto by the clock and remembers the last theme for the pre-boot script', () => {
    const s = start(ist('2026-10-19', '14:00'));
    expect(s.theme()).toBe('bento');
    expect(document.documentElement.dataset['theme']).toBe('bento');
    expect(localStorage.getItem('theme-last')).toBe('bento');
  });

  it('◐ under Auto overrides only until the next switch-over', () => {
    const s = start(ist('2026-10-19', '14:00'));
    s.toggle();
    TestBed.tick();
    expect(s.theme()).toBe('matrix');
    expect(document.documentElement.dataset['theme']).toBe('matrix');
    vi.setSystemTime(ist('2026-10-20', '07:00'));
    vi.advanceTimersByTime(20_000);
    TestBed.tick();
    expect(s.theme()).toBe('bento');
  });

  it('a fixed preference ignores the clock, and ◐ then switches the preference', () => {
    const s = start(ist('2026-10-19', '14:00'));
    s.setPref('matrix');
    TestBed.tick();
    expect(s.theme()).toBe('matrix');
    s.toggle();
    expect(s.pref()).toBe('bento');
    expect(localStorage.getItem('theme-pref')).toBe('bento');
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const s = start(ist('2026-10-19', '20:00'));
    expect(s.theme()).toBe('matrix');
    s.toggle();
    TestBed.tick();
    expect(s.theme()).toBe('bento');
  });
});
