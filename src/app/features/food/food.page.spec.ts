import { TestBed } from '@angular/core/testing';
import { TrackerApi } from '../../data/tracker-api';
import { FoodPage } from './food.page';

const settle = async (f: { whenStable(): Promise<unknown> }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await f.whenStable();
};

describe('FoodPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T08:00:00Z')); // 1:30 PM IST
  });
  afterEach(() => vi.useRealTimers());

  it('shows the day, flags outside-window entries, and adds food from the form', async () => {
    const api = {
      loadFoodDay: vi.fn().mockResolvedValue([
        { id: 'e1', eaten_at: '2026-10-19T06:45:00Z', day: '2026-10-19', name: 'Lunch', kcal: 420, protein_g: null, saved_food_id: null },
        { id: 'e2', eaten_at: '2026-10-19T11:30:00Z', day: '2026-10-19', name: 'Samosa', kcal: 250, protein_g: null, saved_food_id: null },
      ]),
      loadSavedFoods: vi.fn().mockResolvedValue([{ id: 's1', name: 'Chai', kcal: 90, protein_g: null, use_count: 4 }]),
      addFood: vi.fn().mockImplementation(async (f) => ({ id: 'e3', eaten_at: f.eatenAt, day: f.day, name: f.name, kcal: f.kcal, protein_g: f.proteinG, saved_food_id: f.savedFoodId })),
      bumpSavedFood: vi.fn().mockResolvedValue(undefined),
      saveFood: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(FoodPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid=kcal-total]')?.textContent).toBe('670');
    const samosa = [...el.querySelectorAll('li')].find((li) => li.textContent?.includes('Samosa'))!;
    expect(samosa.textContent).toContain('⚠️');

    const field = (name: string) => el.querySelector(`input[name=${name}]`) as HTMLInputElement;
    field('name').value = 'Chai';
    field('kcal').value = '90';
    field('time').value = '12:40';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(api.addFood).toHaveBeenCalledWith({ day: '2026-10-19', name: 'Chai', kcal: 90, proteinG: null, eatenAt: '2026-10-19T07:10:00.000Z', savedFoodId: 's1' });
    expect(api.bumpSavedFood).toHaveBeenCalledWith('s1', 5);
    expect(el.querySelector('[data-testid=kcal-total]')?.textContent).toBe('760');
  });

  const quietApi = () => ({
    loadFoodDay: vi.fn().mockResolvedValue([]),
    loadSavedFoods: vi.fn().mockResolvedValue([]),
    addFood: vi.fn().mockImplementation(async (f) => ({ id: 'n', eaten_at: f.eatenAt, day: f.day, name: f.name, kcal: f.kcal, protein_g: f.proteinG, saved_food_id: f.savedFoodId })),
  });
  const tickTo = (iso: string) => {
    vi.setSystemTime(new Date(iso));
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('keeps a typed time while the clock moves on', async () => {
    const api = quietApi();
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(FoodPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const field = (name: string) => el.querySelector(`input[name=${name}]`) as HTMLInputElement;
    expect(field('time').value).toBe('13:30');

    field('time').value = '12:15';
    field('time').dispatchEvent(new Event('input'));
    tickTo('2026-10-19T08:01:30Z'); // 1:31 PM IST
    await settle(fixture);
    expect(field('time').value).toBe('12:15');

    field('name').value = 'Lunch';
    field('kcal').value = '420';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(api.addFood).toHaveBeenCalledWith(expect.objectContaining({ eatenAt: '2026-10-19T06:45:00.000Z' }));
    expect(field('time').value).toBe('13:31');
  });

  it('follows the app day at 4 AM when it was showing today', async () => {
    vi.setSystemTime(new Date('2026-10-19T17:30:00Z')); // 11 PM IST
    const api = quietApi();
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(FoodPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('header')?.textContent).toContain('Today · Mon 19 Oct');

    tickTo('2026-10-20T03:30:00Z'); // 9 AM IST next day
    await settle(fixture);
    expect(el.querySelector('header')?.textContent).toContain('Today · Tue 20 Oct');
    expect(api.loadFoodDay).toHaveBeenLastCalledWith('2026-10-20');
  });
});
