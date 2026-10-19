import { TestBed } from '@angular/core/testing';
import { PerfectDay } from './perfect-day';

async function render(perfect: boolean) {
  const fixture = TestBed.createComponent(PerfectDay);
  fixture.componentRef.setInput('perfect', perfect);
  fixture.componentRef.setInput('today', '2026-10-19');
  fixture.componentRef.setInput('rings', 8);
  fixture.componentRef.setInput('streak', 13);
  fixture.componentRef.setInput('countThisMonth', 5);
  await fixture.whenStable();
  return fixture;
}

describe('PerfectDay', () => {
  beforeEach(() => localStorage.clear());

  it('celebrates once per day', async () => {
    const first = await render(true);
    const el = first.nativeElement as HTMLElement;
    expect(el.querySelector('[role=dialog]')?.textContent).toContain('PERFECT DAY');
    expect(el.textContent).toContain('All 8 rings closed');
    expect(el.textContent).toContain('Perfect Day #5 this month');
    (el.querySelector('button') as HTMLButtonElement).click();
    await first.whenStable();
    expect(el.querySelector('[role=dialog]')).toBeNull();
    const again = await render(true);
    expect((again.nativeElement as HTMLElement).querySelector('[role=dialog]')).toBeNull();
  });

  it('stays hidden on an ordinary day', async () => {
    const f = await render(false);
    expect((f.nativeElement as HTMLElement).querySelector('[role=dialog]')).toBeNull();
  });
});
