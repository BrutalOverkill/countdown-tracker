import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ThemeService } from '../core/theme.service';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Progress bar: a rounded bar in Bento, ten dots in Matrix. `marker` (0–1) shows where you should be. */
@Component({
  selector: 'app-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (matrix()) {
      <div class="flex gap-1" aria-hidden="true">
        @for (d of dots(); track $index) {
          <span data-dot [attr.data-on]="d.on" class="size-[7px] rounded-full"
            [class]="d.on ? 'bg-[#f2f2f2]' : d.marker ? 'border border-accent' : 'bg-[#2a2a2a]'"></span>
        }
      </div>
    } @else {
      <div class="relative h-1.5 rounded-full" [style.background]="track()" aria-hidden="true">
        <div data-bar class="meter-fill h-full rounded-full" [style.width.%]="f() * 100" [style.background]="color()"></div>
        @if (marker(); as m) {
          <span class="absolute -top-0.5 h-2.5 w-0.5 rounded bg-white/80" [style.left.%]="m * 100"></span>
        }
      </div>
    }
  `,
})
export class Meter {
  readonly fraction = input.required<number>();
  readonly color = input('#000000');
  readonly track = input('rgb(0 0 0 / 0.2)');
  readonly marker = input<number | null>(null);
  private readonly theme = inject(ThemeService);
  protected readonly matrix = computed(() => this.theme.theme() === 'matrix');
  private readonly shown = signal(false);
  protected readonly f = computed(() => (this.shown() ? clamp01(this.fraction()) : 0));
  protected readonly dots = computed(() => {
    const on = Math.round(clamp01(this.fraction()) * 10);
    const m = this.marker();
    const markerIndex = m === null ? -1 : Math.min(9, Math.floor(clamp01(m) * 10));
    return Array.from({ length: 10 }, (_, i) => ({ on: i < on, marker: i === markerIndex && i >= on }));
  });

  constructor() {
    afterNextRender(() => this.shown.set(true));
  }
}
