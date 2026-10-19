import { TestBed } from '@angular/core/testing';
import { DEFAULT_GOALS } from '../../domain/types';
import { TrackerApi } from '../../data/tracker-api';
import { FastingSection } from './fasting-section';
import { ShortcutSection } from './shortcut-section';
import { AppearanceSection } from './appearance-section';
import { HabitsSection } from './habits-section';

const settle = async (f: { whenStable(): Promise<unknown> }) => {
  await f.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  await f.whenStable();
};

function fakeApi(extra: Record<string, unknown> = {}) {
  return {
    loadConfig: vi.fn().mockResolvedValue({ goals: DEFAULT_GOALS, lastSyncAt: null, hasToken: true, habits: [], countdowns: [], challenges: [] }),
    updateFasting: vi.fn().mockResolvedValue(undefined),
    rotateToken: vi.fn().mockResolvedValue('abc123'),
    ...extra,
  };
}

describe('Settings sections', () => {
  it('FastingSection rejects overlapping windows and saves valid ones sorted', async () => {
    const api = fakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(FastingSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const start2 = el.querySelector('[aria-label="Window 2 start"]') as HTMLInputElement;
    start2.value = '00:30';
    start2.dispatchEvent(new Event('change'));
    (el.querySelector('button.btn') as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.querySelector('[role=alert]')?.textContent).toContain("Windows can't overlap");
    expect(api.updateFasting).not.toHaveBeenCalled();

    start2.value = '12:00';
    start2.dispatchEvent(new Event('change'));
    (el.querySelector('button.btn') as HTMLButtonElement).click();
    await settle(fixture);
    expect(api.updateFasting).toHaveBeenCalledWith(true, [{ start: '00:00', end: '01:00' }, { start: '12:00', end: '13:00' }]);
  });

  it('ShortcutSection shows a new token once, after a confirming second tap, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const api = fakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: api }] });
    const fixture = TestBed.createComponent(ShortcutSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const rotate = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('token'))!;
    expect(rotate.textContent).toContain('Generate token');
    rotate.click();
    await settle(fixture);
    expect((el.querySelector('[aria-label="Sync token"]') as HTMLInputElement).value).toBe('abc123');
    ([...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Copy') as HTMLButtonElement).click();
    await settle(fixture);
    expect(writeText).toHaveBeenCalledWith('abc123');
  });

  it('AppearanceSection switches the theme preference and applies it', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: fakeApi() }] });
    const fixture = TestBed.createComponent(AppearanceSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const radio = (name: string) => [...el.querySelectorAll('[role=radio]')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
    expect(radio('Auto').getAttribute('aria-checked')).toBe('true');
    radio('Matrix').click();
    await settle(fixture);
    expect(radio('Matrix').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset['theme']).toBe('matrix');
    expect(localStorage.getItem('theme-pref')).toBe('matrix');
  });

  it('HabitsSection shows the weekday picker only for weekly habits', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: fakeApi() }] });
    const fixture = TestBed.createComponent(HabitsSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const day = el.querySelector('[aria-label="New habit weekday"]') as HTMLSelectElement;
    const freq = el.querySelector('[aria-label="New habit frequency"]') as HTMLSelectElement;
    expect(day.hidden).toBe(true);
    freq.value = 'weekly';
    freq.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(day.hidden).toBe(false);
  });

  it('HabitsSection shows the every-N-days field only for that frequency', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: TrackerApi, useValue: fakeApi() }] });
    const fixture = TestBed.createComponent(HabitsSection);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const every = el.querySelector('[aria-label="New habit every N days"]') as HTMLInputElement;
    const freq = el.querySelector('[aria-label="New habit frequency"]') as HTMLSelectElement;
    expect(every.hidden).toBe(true);
    freq.value = 'interval';
    freq.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(every.hidden).toBe(false);
    expect(every.value).toBe('4');
  });
});
