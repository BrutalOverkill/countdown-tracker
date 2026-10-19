import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ChallengeProgress, ChallengeStatus } from '../../domain/challenges';
import { Meter } from '../../ui/meter';
import type { ChallengeGroupVm } from './today.vm';

const CHIP_TEXT: Record<ChallengeStatus, string> = { on_track: 'ON TRACK', behind: 'BEHIND', won: 'WON 🏆', out_of_reach: 'OUT OF REACH' };
const BAR: Record<ChallengeStatus, string> = { on_track: 'var(--color-steps)', behind: 'var(--color-kcal)', won: 'var(--color-count)', out_of_reach: 'var(--color-muted)' };

@Component({
  selector: 'app-challenges-card',
  imports: [Meter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="tile h-full" [attr.aria-label]="group().title + ' challenges'">
      <p class="label mb-1 text-count">{{ group().emoji }} {{ group().title }} · challenges</p>
      @for (r of group().rows; track r.id) {
        <div class="mt-2">
          <div class="flex items-center justify-between text-sm">
            <span>{{ r.habitName }}</span>
            <span><b>{{ r.progress.done }}</b>/{{ r.progress.target }} days <span class="chip ml-1" [attr.data-status]="r.progress.status">{{ chip[r.progress.status] }}</span></span>
          </div>
          <app-meter class="mt-1" [fraction]="ratio(r.progress)" [color]="bar[r.progress.status]" track="var(--color-raised)" [marker]="r.progress.pace" />
        </div>
      }
      <p class="muted mt-2">{{ group().footer }}</p>
    </section>
  `,
})
export class ChallengesCard {
  readonly group = input.required<ChallengeGroupVm>();
  protected readonly chip = CHIP_TEXT;
  protected readonly bar = BAR;
  protected ratio(p: ChallengeProgress): number {
    return p.done / p.target;
  }
}
