import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { storageGet, storageSet } from '../../core/storage';
import { ThemeService } from '../../core/theme.service';
import type { Day } from '../../domain/types';

const KEY = 'perfect-day-shown';
const BENTO = ['#ff3d8b', '#c8ff00', '#3d7bff', '#8b5cf6', '#ff7a1a', '#ffd60a'];
const MATRIX = ['#ff3b30', '#f2f2f2'];

@Component({
  selector: 'app-perfect-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .confetti { position: absolute; top: -20px; animation: fall 2.6s linear infinite; }
    @keyframes fall { to { transform: translateY(110vh) rotate(540deg); } }
  `,
  template: `
    @if (visible()) {
      <div role="dialog" aria-modal="true" aria-label="Perfect Day"
        class="fixed inset-0 z-40 grid place-items-center overflow-hidden bg-black/95 text-center">
        @for (c of confetti(); track $index) {
          <span class="confetti" [style.left.%]="c.left" [style.background]="c.color" [style.animation-delay.ms]="c.delay"
            [style.width.px]="c.size" [style.height.px]="c.round ? c.size : c.size * 1.8" [style.border-radius]="c.round ? '50%' : '3px'"></span>
        }
        <div class="relative z-10 px-6">
          <div class="text-6xl">⭐</div>
          <p class="num mt-3 text-5xl text-count">PERFECT DAY</p>
          <p class="mt-2 text-sm">All {{ rings() }} rings closed · <b>100</b>/100</p>
          <p class="mx-auto mt-5 w-fit rounded-full bg-raised px-4 py-1.5 text-base font-extrabold text-streak"><span class="flicker">🔥</span> {{ streak() }}-day streak</p>
          <p class="muted mt-3">Perfect Day #{{ countThisMonth() }} this month.<br />A gold ⭐ goes on today's spoke of the wheel.</p>
          <button type="button" class="btn press mt-6" (click)="visible.set(false)">Nice 🙌</button>
        </div>
      </div>
    }
  `,
})
export class PerfectDay {
  readonly perfect = input.required<boolean>();
  readonly today = input.required<Day>();
  readonly rings = input.required<number>();
  readonly streak = input.required<number>();
  readonly countThisMonth = input.required<number>();
  private readonly theme = inject(ThemeService);
  protected readonly visible = signal(false);
  protected readonly confetti = computed(() => {
    const matrix = this.theme.theme() === 'matrix';
    const colors = matrix ? MATRIX : BENTO;
    return Array.from({ length: 60 }, (_, i) => ({
      left: (i * 37) % 100, color: colors[i % colors.length], delay: (i * 97) % 2600, size: 4 + (i % 5), round: matrix,
    }));
  });

  constructor() {
    effect(() => {
      if (this.perfect() && storageGet(KEY) !== this.today()) {
        storageSet(KEY, this.today());
        this.visible.set(true);
      }
    });
  }
}
