import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ThemeService } from '../core/theme.service';

const R = 26;
const DOTS = 30;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Progress ring: a solid arc in Bento, a ring of dots in Matrix. Fills from 0 after first render. */
@Component({
  selector: 'app-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-grid shrink-0 place-items-center', '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
  template: `
    <svg viewBox="0 0 64 64" class="-rotate-90 [grid-area:1/1]" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
      @if (matrix()) {
        @for (d of dots(); track $index) {
          <circle data-dot [attr.cx]="d.x" [attr.cy]="d.y" r="2.3" [attr.fill]="d.on ? '#ff3b30' : '#2a2a2a'" />
        }
      } @else {
        <circle cx="32" cy="32" [attr.r]="r" fill="none" [attr.stroke]="track()" stroke-width="8" />
        <circle data-arc class="ring-arc" cx="32" cy="32" [attr.r]="r" fill="none" [attr.stroke]="color()" stroke-width="8" stroke-linecap="round" [attr.stroke-dasharray]="dash()" />
      }
    </svg>
    <div class="[grid-area:1/1] text-center leading-none"><ng-content /></div>
  `,
})
export class Ring {
  readonly fraction = input.required<number>();
  readonly color = input('#000000');
  readonly track = input('rgb(0 0 0 / 0.18)');
  readonly size = input(56);
  protected readonly r = R;
  private readonly theme = inject(ThemeService);
  protected readonly matrix = computed(() => this.theme.theme() === 'matrix');
  private readonly shown = signal(false);
  private readonly f = computed(() => (this.shown() ? clamp01(this.fraction()) : 0));
  protected readonly dash = computed(() => `${2 * Math.PI * R * this.f()} 999`);
  protected readonly dots = computed(() =>
    Array.from({ length: DOTS }, (_, i) => {
      const a = (i / DOTS) * 2 * Math.PI;
      return { x: 32 + R * Math.cos(a), y: 32 + R * Math.sin(a), on: i < Math.round(this.f() * DOTS) };
    }),
  );

  constructor() {
    afterNextRender(() => this.shown.set(true));
  }
}
