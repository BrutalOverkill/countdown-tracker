import { DEFAULT_GOALS } from '../../domain/types';
import { defaultTime, foodLines, parseFood, suggest, totals } from './food-day';

const entry = (id: string, eaten_at: string, kcal: number, protein_g: number | null = null) => ({ id, eaten_at, day: '2026-10-19', name: id, kcal, protein_g, saved_food_id: null });

describe('food day', () => {
  it('flags entries outside the eating windows when fasting is on', () => {
    const lines = foodLines([entry('late', '2026-10-19T19:00:00Z', 560), entry('lunch', '2026-10-19T06:45:00Z', 420), entry('snack', '2026-10-19T11:30:00Z', 90)], DEFAULT_GOALS);
    expect(lines.map((l) => [l.name, l.time, l.outside])).toEqual([['lunch', '12:15 PM', false], ['snack', '5:00 PM', true], ['late', '12:30 AM', false]]);
    expect(foodLines([entry('snack', '2026-10-19T11:30:00Z', 90)], { ...DEFAULT_GOALS, fastingEnabled: false })[0].outside).toBe(false);
  });

  it('totals calories, and protein only when logged', () => {
    expect(totals([entry('a', '2026-10-19T06:00:00Z', 500, 20), entry('b', '2026-10-19T07:00:00Z', 300)])).toEqual({ kcal: 800, protein: 20 });
    expect(totals([entry('a', '2026-10-19T06:00:00Z', 500)])).toEqual({ kcal: 500, protein: null });
  });

  it('suggests saved foods by name', () => {
    const saved = [{ id: '1', name: '2 roti', kcal: 240, protein_g: null, use_count: 9 }, { id: '2', name: 'Dal bowl', kcal: 180, protein_g: 9, use_count: 3 }];
    expect(suggest(saved, 'DAL').map((s) => s.id)).toEqual(['2']);
    expect(suggest(saved, '').map((s) => s.id)).toEqual(['1', '2']);
  });

  it('defaults the time to now today, noon otherwise', () => {
    expect(defaultTime('2026-10-19', '2026-10-19', new Date('2026-10-19T13:20:00Z'))).toBe('18:50');
    expect(defaultTime('2026-10-18', '2026-10-19', new Date('2026-10-19T13:20:00Z'))).toBe('12:00');
  });

  it('parses the form into an entry on the right instant', () => {
    expect(parseFood({ name: ' Paneer bhurji ', kcal: '320', protein: '18.5', time: '00:30' }, '2026-10-19')).toEqual({
      ok: true, value: { name: 'Paneer bhurji', kcal: 320, proteinG: 18.5, eatenAt: '2026-10-19T19:00:00.000Z' },
    });
    expect(parseFood({ name: 'Chai', kcal: '90', protein: '', time: '12:15' }, '2026-10-19')).toMatchObject({ ok: true, value: { proteinG: null } });
  });

  it('explains what is wrong', () => {
    expect(parseFood({ name: ' ', kcal: '90', protein: '', time: '12:00' }, '2026-10-19')).toEqual({ ok: false, error: 'Give the food a name' });
    expect(parseFood({ name: 'Chai', kcal: '9.5', protein: '', time: '12:00' }, '2026-10-19')).toEqual({ ok: false, error: 'Calories must be a whole number from 0 to 10000' });
    expect(parseFood({ name: 'Chai', kcal: '90', protein: '-1', time: '12:00' }, '2026-10-19')).toEqual({ ok: false, error: 'Protein must be 0–1000 g' });
    expect(parseFood({ name: 'Chai', kcal: '90', protein: '', time: '' }, '2026-10-19')).toEqual({ ok: false, error: 'Pick a time' });
  });
});
