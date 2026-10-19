import { TestBed } from '@angular/core/testing';
import type { Type } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { CountUp } from './count-up';
import { Meter } from './meter';
import { Ring } from './ring';

async function render<T>(type: Type<T>, inputs: Record<string, unknown>): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('UI primitives', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('Ring draws an arc in Bento and 30 dots (half lit) in Matrix', async () => {
    TestBed.inject(ThemeService).setPref('bento');
    const bento = await render(Ring, { fraction: 0.5 });
    expect(bento.querySelector('[data-arc]')).not.toBeNull();
    expect(bento.querySelectorAll('[data-dot]')).toHaveLength(0);

    TestBed.inject(ThemeService).setPref('matrix');
    const matrix = await render(Ring, { fraction: 0.5 });
    const dots = [...matrix.querySelectorAll('[data-dot]')];
    expect(dots).toHaveLength(30);
    expect(dots.filter((d) => d.getAttribute('fill') === '#ff3b30')).toHaveLength(15);
  });

  it('Ring treats a missing goal (NaN) as empty instead of breaking', async () => {
    TestBed.inject(ThemeService).setPref('bento');
    const el = await render(Ring, { fraction: Number.NaN });
    expect(el.querySelector('[data-arc]')?.getAttribute('stroke-dasharray')).toBe('0 999');
  });

  it('Meter draws a bar in Bento and 10 dots in Matrix', async () => {
    TestBed.inject(ThemeService).setPref('bento');
    const bento = await render(Meter, { fraction: 0.78 });
    expect((bento.querySelector('[data-bar]') as HTMLElement).style.width).toBe('78%');

    TestBed.inject(ThemeService).setPref('matrix');
    const matrix = await render(Meter, { fraction: 0.78 });
    const dots = [...matrix.querySelectorAll('[data-dot]')];
    expect(dots).toHaveLength(10);
    expect(dots.filter((d) => d.getAttribute('data-on') === 'true')).toHaveLength(8);
  });

  it('CountUp jumps straight to the value under Reduce Motion', async () => {
    const el = await render(CountUp, { value: 7842 });
    expect(el.textContent?.trim()).toBe('7,842');
  });

  it('CountUp animates to the value when motion is allowed', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now() + 1000);
      return 1;
    });
    const el = await render(CountUp, { value: 120 });
    expect(el.textContent?.trim()).toBe('120');
  });
});
