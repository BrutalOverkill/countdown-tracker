import { istMinutesOf, weekdayOf, type Day } from '@shared/days';
import { formatClock } from '@shared/windows';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const numbers = new Intl.NumberFormat('en-IN');

export function formatNumber(n: number): string {
  return numbers.format(n);
}

export function formatCompact(n: number): string {
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const dayOfMonth = (day: Day) => Number(day.slice(8, 10));
const month = (day: Day) => MONTHS[Number(day.slice(5, 7)) - 1];

export function weekdayShort(day: Day): string {
  return WEEKDAYS[weekdayOf(day)];
}

export function dayLabel(day: Day): string {
  return `${weekdayShort(day)} ${dayOfMonth(day)} ${month(day)}`;
}

export function dayLabelWithYear(day: Day): string {
  return `${dayLabel(day)} ${day.slice(0, 4)}`;
}

export function monthLabel(day: Day): string {
  return `${month(day)} ${day.slice(0, 4)}`;
}

export function dayRange(from: Day, to: Day): string {
  return `${dayOfMonth(from)} ${month(from)} – ${dayOfMonth(to)} ${month(to)}`;
}

export function timeOf(iso: string): string {
  return formatClock(istMinutesOf(new Date(iso)));
}

export function hhmmOf(date: Date): string {
  const m = istMinutesOf(date);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function greetingName(email: string): string {
  const first = (email.split('@')[0] ?? '').split(/[.+_-]/)[0] ?? '';
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : '';
}
