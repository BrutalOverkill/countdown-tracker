import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { appDayOf } from '@shared/days';
import { dayLabel, formatCompact, timeOf } from '../../core/format';
import { CountUp } from '../../ui/count-up';
import { Meter } from '../../ui/meter';

@Component({
  selector: 'app-steps-tile',
  imports: [CountUp, Meter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="tile press h-full" data-tone="blue" aria-label="Steps">
      <p class="label">Steps</p>
      <p class="num mt-1 text-[34px]"><app-count [value]="steps()" /></p>
      <app-meter class="mt-2" [fraction]="steps() / goal()" />
      <p class="mt-1 text-[10px] font-bold">of {{ compact(goal()) }}</p>
      <p class="mt-0.5 text-[10px]" [class.font-bold]="stale()">{{ syncLabel() }}</p>
    </section>
  `,
})
export class StepsTile {
  readonly steps = input.required<number>();
  readonly goal = input.required<number>();
  readonly lastSyncAt = input.required<string | null>();
  readonly stale = input.required<boolean>();
  protected readonly compact = formatCompact;
  protected readonly syncLabel = computed(() => {
    const at = this.lastSyncAt();
    if (!at) return 'not synced yet';
    return this.stale() ? `⚠️ last synced ${dayLabel(appDayOf(new Date(at)))}, ${timeOf(at)}` : `synced ${timeOf(at)}`;
  });
}
