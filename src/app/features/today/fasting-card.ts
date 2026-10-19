import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatDuration } from '../../core/format';
import { Meter } from '../../ui/meter';
import type { FastingVm } from './today.vm';

@Component({
  selector: 'app-fasting-card',
  imports: [Meter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let f = fasting();
    <section class="tile press h-full" data-tone="violet" aria-label="Fasting">
      @if (f.kind === 'open') {
        <p class="label">🍽️ Eating window</p>
        <p class="num mt-1 text-[30px]">{{ dur(f.minutesLeft) }}</p>
        <p class="text-[11px] font-bold">left · closes {{ f.closesAt }}</p>
      }
      @if (f.kind === 'fasting') {
        <p class="label">🌙 Fasting</p>
        <p class="num mt-1 text-[30px]">{{ dur(f.doneMinutes) }}</p>
        <p class="text-[11px] font-bold">opens {{ f.nextAt }} · in {{ dur(f.minutesUntilNext) }}</p>
      }
      <app-meter class="mt-2" [fraction]="f.fraction" />
    </section>
  `,
})
export class FastingCard {
  readonly fasting = input.required<FastingVm>();
  protected readonly dur = formatDuration;
}
