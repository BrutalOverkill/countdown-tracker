import { autoTheme, effectiveTheme, nextSwitch, parseOverride, parsePref } from './theme';

const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

describe('theme rules', () => {
  it('Auto is Bento from 06:00 to 18:59 IST and Matrix otherwise', () => {
    expect(autoTheme(ist('2026-10-19', '05:59'))).toBe('matrix');
    expect(autoTheme(ist('2026-10-19', '06:00'))).toBe('bento');
    expect(autoTheme(ist('2026-10-19', '18:59'))).toBe('bento');
    expect(autoTheme(ist('2026-10-19', '19:00'))).toBe('matrix');
  });

  it('finds the next switch-over', () => {
    expect(nextSwitch(ist('2026-10-19', '14:00'))).toEqual(ist('2026-10-19', '19:00'));
    expect(nextSwitch(ist('2026-10-19', '20:15'))).toEqual(ist('2026-10-20', '06:00'));
    expect(nextSwitch(ist('2026-10-20', '03:00'))).toEqual(ist('2026-10-20', '06:00'));
  });

  it('lets a fixed preference win, and an override beat Auto until it expires', () => {
    const at2pm = ist('2026-10-19', '14:00');
    const until7pm = ist('2026-10-19', '19:00').toISOString();
    expect(effectiveTheme('matrix', null, at2pm)).toBe('matrix');
    expect(effectiveTheme('bento', { theme: 'matrix', until: until7pm }, at2pm)).toBe('bento');
    expect(effectiveTheme('auto', { theme: 'matrix', until: until7pm }, at2pm)).toBe('matrix');
    expect(effectiveTheme('auto', { theme: 'matrix', until: ist('2026-10-19', '13:00').toISOString() }, at2pm)).toBe('bento');
  });

  it('parses stored values defensively', () => {
    expect(parsePref('matrix')).toBe('matrix');
    expect(parsePref('nonsense')).toBe('auto');
    expect(parsePref(null)).toBe('auto');
    expect(parseOverride('{"theme":"matrix","until":"2026-10-19T13:30:00.000Z"}')).toEqual({ theme: 'matrix', until: '2026-10-19T13:30:00.000Z' });
    expect(parseOverride('{bad json')).toBeNull();
    expect(parseOverride('{"theme":"neon","until":"x"}')).toBeNull();
    expect(parseOverride('')).toBeNull();
  });
});
