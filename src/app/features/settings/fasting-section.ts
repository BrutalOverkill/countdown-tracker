import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { sortWindows, validateWindows, type EatingWindow } from '@shared/windows';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { nextColor } from '../../domain/palette';
import { isActiveOn } from '../../domain/visibility';

@Component({
  selector: 'app-fasting-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Fasting">
      <fieldset class="m-0 min-w-0 border-0 p-0" [disabled]="store.saving()">
      <div class="flex items-center justify-between">
        <p class="label text-weekly">Fasting</p>
        <button type="button" role="switch" aria-label="Fasting on" [attr.aria-checked]="enabled()" (click)="setEnabled(!enabled())"
          class="relative h-6 w-11 rounded-full" [class]="enabled() ? 'bg-steps' : 'bg-raised'">
          <span class="absolute top-0.5 size-5 rounded-full bg-white" [class]="enabled() ? 'left-[22px] matrix:bg-black' : 'left-0.5'"></span>
        </button>
      </div>
      <p class="muted mb-2">Eat only inside these windows. The Food Guard closes food apps outside them.</p>
      @for (w of draft(); track $index; let i = $index) {
        <div class="flex items-center gap-1.5 py-1">
          <input class="field !w-28" type="time" [value]="w.start" [attr.aria-label]="'Window ' + (i + 1) + ' start'" (change)="setTime(i, 'start', $any($event.target).value)" />
          <span class="text-muted">–</span>
          <input class="field !w-28" type="time" [value]="w.end" [attr.aria-label]="'Window ' + (i + 1) + ' end'" (change)="setTime(i, 'end', $any($event.target).value)" />
          <button type="button" class="ml-auto text-xs text-muted underline" (click)="removeWindow(i)">Remove</button>
        </div>
      }
      <div class="mt-2 flex gap-2">
        @if (draft().length < 3) {
          <button type="button" class="btn-quiet" (click)="addWindow()">+ Add window</button>
        }
        <button type="button" class="btn" (click)="save()">Save windows</button>
      </div>
      @if (error(); as e) {
        <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
      }
      @if (saved()) {
        <p class="mt-1 text-sm text-steps" role="status">Saved</p>
      }
      </fieldset>
    </section>
  `,
})
export class FastingSection {
  protected readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly enabled = computed(() => this.store.goals().fastingEnabled);
  protected readonly draft = linkedSignal<EatingWindow[]>(() => this.store.goals().windows.map((w) => ({ ...w })));
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected setTime(i: number, key: 'start' | 'end', value: string): void {
    this.draft.update((list) => list.map((w, j) => (j === i ? { ...w, [key]: value } : w)));
    this.saved.set(false);
  }

  protected addWindow(): void {
    this.draft.update((list) => [...list, { start: '18:00', end: '19:00' }]);
  }

  protected removeWindow(i: number): void {
    this.draft.update((list) => list.filter((_, j) => j !== i));
  }

  protected async save(): Promise<void> {
    const problem = validateWindows(this.draft());
    this.error.set(problem);
    if (problem) return;
    const windows = sortWindows(this.draft());
    this.saved.set(await this.store.guard(() => this.api.updateFasting(this.enabled(), windows)));
  }

  protected async setEnabled(on: boolean): Promise<void> {
    const habits = this.store.habits();
    const active = habits.filter((h) => h.source === 'fasting' && isActiveOn(h, this.store.today()));
    await this.store.guard(async () => {
      await this.api.updateFasting(on, this.store.goals().windows);
      if (on && active.length === 0) {
        await this.api.addHabit({
          name: 'Fasting windows kept', emoji: '🌙', color: nextColor(habits.map((h) => h.color)), frequency: 'daily',
          source: 'fasting', slot: 'anytime', weekday: null, sortOrder: Math.max(0, ...habits.map((h) => h.sortOrder)) + 1,
        });
      }
      if (!on) for (const h of active) await this.api.archiveHabit(h.id);
    });
  }
}
