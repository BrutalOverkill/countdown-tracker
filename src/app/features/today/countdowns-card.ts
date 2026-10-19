import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountUp } from '../../ui/count-up';
import type { CountdownTile } from './today.vm';

@Component({
  selector: 'app-countdowns-card',
  imports: [RouterLink, CountUp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="tile press h-full" data-tone="pink" aria-label="Countdowns">
      @if (main(); as m) {
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="label">{{ m.emoji }} {{ m.title }}</p>
            @if (m.isToday) {
              <p class="num mt-1 text-[40px]">Today! {{ m.emoji }}</p>
              <a class="mt-1 inline-block text-xs font-bold underline" [routerLink]="['/report', m.id]">See your report card →</a>
            } @else {
              <p class="num mt-1 text-[64px]"><app-count [value]="m.days" /></p>
              <p class="text-sm font-bold">{{ m.days === 1 ? 'day' : 'days' }} to go</p>
            }
          </div>
          <div class="text-right">
            @for (t of rest(); track t.id) {
              <p class="label">{{ t.emoji }} {{ t.title }}</p>
              @if (t.isToday) {
                <a class="num mb-1 block text-[24px] underline" [routerLink]="['/report', t.id]">Today!</a>
              } @else {
                <p class="num text-[30px]">{{ t.days }}</p>
                <p class="mb-1 text-[11px] font-bold">{{ t.days === 1 ? 'day' : 'days' }}</p>
              }
            }
          </div>
        </div>
      } @else {
        <p class="text-sm font-bold">No countdowns yet — add one in Settings.</p>
      }
    </section>
  `,
})
export class CountdownsCard {
  readonly tiles = input.required<CountdownTile[]>();
  protected readonly main = computed(() => this.tiles()[0] ?? null);
  protected readonly rest = computed(() => this.tiles().slice(1, 3));
}
