import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { parseTargets } from './settings-forms';

@Component({
  selector: 'app-targets-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Targets">
      <fieldset class="m-0 min-w-0 border-0 p-0" [disabled]="store.saving()">
      <p class="label mb-1 text-steps">Targets</p>
      <form class="grid grid-cols-[1fr_7rem] items-center gap-1.5 text-sm" (submit)="save($event, steps.value, kcal.value)">
        <label for="step-goal">Steps</label>
        <input #steps id="step-goal" class="field" inputmode="numeric" [value]="store.goals().stepGoal" />
        <label for="kcal-goal">Calories (kcal)</label>
        <input #kcal id="kcal-goal" class="field" inputmode="numeric" [value]="store.goals().kcalGoal" />
        <button class="btn col-span-2" type="submit">Save targets</button>
      </form>
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
export class TargetsSection {
  protected readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected async save(event: Event, steps: string, kcal: string): Promise<void> {
    event.preventDefault();
    const parsed = parseTargets({ steps, kcal });
    this.saved.set(false);
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const { stepGoal, kcalGoal } = parsed.value;
    this.saved.set(await this.store.guard(() => this.api.updateGoals(stepGoal, kcalGoal)));
  }
}
