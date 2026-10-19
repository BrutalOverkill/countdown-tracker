import { dayLabel, dayLabelWithYear, dayRange, formatCompact, formatDuration, formatNumber, greetingName, hhmmOf, monthLabel, timeOf, weekdayShort } from './format';

describe('format', () => {
  it('formats numbers the Indian way', () => {
    expect(formatNumber(7842)).toBe('7,842');
    expect(formatNumber(196420)).toBe('1,96,420');
  });

  it('compacts large numbers', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(9821)).toBe('9.8k');
    expect(formatCompact(10000)).toBe('10k');
    expect(formatCompact(196420)).toBe('196k');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(200)).toBe('3h 20m');
  });

  it('labels days and months', () => {
    expect(dayLabel('2026-10-19')).toBe('Mon 19 Oct');
    expect(weekdayShort('2026-10-18')).toBe('Sun');
    expect(dayLabelWithYear('2026-11-08')).toBe('Sun 8 Nov 2026');
    expect(monthLabel('2026-10-19')).toBe('Oct 2026');
    expect(dayRange('2026-10-19', '2026-11-07')).toBe('19 Oct – 7 Nov');
  });

  it('shows IST clock times', () => {
    expect(timeOf('2026-10-19T12:30:00Z')).toBe('6:00 PM');
    expect(hhmmOf(new Date('2026-10-19T19:05:00Z'))).toBe('00:35');
  });

  it('greets by first name from the email', () => {
    expect(greetingName('anvit.singh@octagos.com')).toBe('Anvit');
    expect(greetingName('you+countdown-test@gmail.com')).toBe('You');
    expect(greetingName('')).toBe('');
  });
});
