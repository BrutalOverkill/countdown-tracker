import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';
import { formatNumber } from '../core/format';
import { reducedMotion } from '../core/motion';

/** Counts up to each new value over ~600 ms; instant under Reduce Motion. */
@Component({
  selector: 'app-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ format()(shown()) }}`,
})
export class CountUp {
  readonly value = input.required<number>();
  readonly format = input<(n: number) => string>(formatNumber);
  protected readonly shown = signal(0);

  constructor() {
    effect((onCleanup) => {
      const target = this.value();
      const from = untracked(this.shown);
      if (from === target || reducedMotion() || typeof requestAnimationFrame !== 'function') {
        this.shown.set(target);
        return;
      }
      const start = performance.now();
      let frame = 0;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 600);
        this.shown.set(Math.round(from + (target - from) * (1 - (1 - p) ** 3)));
        if (p < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      onCleanup(() => cancelAnimationFrame(frame));
    });
  }
}
