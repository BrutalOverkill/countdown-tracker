import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { addDays, instantFor, type Day } from '@shared/days';
import { Clock } from '../../core/clock';
import { dayLabel, formatNumber } from '../../core/format';
import { Online } from '../../core/online';
import { SAVE_FAILED, ToastService } from '../../core/toast.service';
import type { FoodEntryRow, SavedFoodRow } from '../../data/rows';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { Meter } from '../../ui/meter';
import { defaultTime, foodLines, parseFood, suggest, totals, type FoodLine } from './food-day';

@Component({
  selector: 'app-food-page',
  imports: [Meter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-2 flex items-center justify-between px-1">
      <h1 class="text-2xl font-extrabold">Food</h1>
      <div class="flex items-center gap-1 text-sm text-muted">
        <button type="button" aria-label="Previous day" class="px-2" (click)="shiftDay(-1)">‹</button>
        <span>{{ dayText() }}</span>
        <button type="button" aria-label="Next day" class="px-2 disabled:opacity-30" [disabled]="day() >= store.today()" (click)="shiftDay(1)">›</button>
      </div>
    </header>

    <div class="grid gap-2 lg:grid-cols-2">
      <section class="card" aria-label="Calories">
        <div class="flex items-baseline justify-between">
          <p><span class="num text-4xl text-kcal" data-testid="kcal-total">{{ n(total().kcal) }}</span> <span class="muted">/ {{ n(goal()) }} kcal</span></p>
          <p class="text-sm font-bold" [class.text-kcal]="total().kcal > goal()">{{ total().kcal > goal() ? n(total().kcal - goal()) + ' over' : n(goal() - total().kcal) + ' left' }}</p>
        </div>
        <app-meter class="mt-1.5" [fraction]="total().kcal / goal()" color="var(--color-kcal)" track="var(--color-raised)" />
        @if (total().protein !== null) {
          <p class="muted mt-1">Protein {{ total().protein }} g</p>
        }
      </section>

      <section class="card" aria-label="Quick add">
        <p class="label mb-1.5 text-kcal">Quick add</p>
        <form class="flex flex-wrap gap-1.5" (submit)="add($event, name, kcal, protein, time)">
          <input #name class="field" name="name" placeholder="Food…" maxlength="60" autocomplete="off" [disabled]="!online()" (input)="query.set(name.value)" />
          <input #kcal class="field !w-[4.5rem]" name="kcal" inputmode="numeric" placeholder="kcal" [disabled]="!online()" />
          <input #protein class="field !w-[5.5rem]" name="protein" inputmode="decimal" placeholder="protein g" [disabled]="!online()" />
          <input #time class="field !w-[6.5rem]" name="time" type="time" [value]="chosenTime() ?? defaultTime()" [disabled]="!online()" (input)="chosenTime.set(time.value)" />
          <button type="button" class="btn-quiet" [attr.aria-pressed]="saveIt()" (click)="saveIt.set(!saveIt())">{{ saveIt() ? '★ saved' : '☆ save' }}</button>
          <button class="btn flex-1" type="submit" [disabled]="!online() || busy()">Add</button>
        </form>
        @if (error(); as e) {
          <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
        }
        <div class="mt-2 flex items-center justify-between">
          <p class="label text-muted">Saved · tap to add</p>
          @if (saved().length) {
            <button type="button" class="text-xs text-muted underline" (click)="editSaved.set(!editSaved())">{{ editSaved() ? 'Done' : 'Edit' }}</button>
          }
        </div>
        <div class="mt-1 flex flex-wrap gap-1">
          @for (s of chips(); track s.id) {
            @if (editSaved()) {
              <button type="button" class="rounded-xl bg-raised px-2 py-1 text-xs" [attr.aria-label]="'Delete saved ' + s.name" [disabled]="busy()" (click)="deleteSaved(s)">✕ {{ s.name }}</button>
            } @else {
              <button type="button" class="rounded-xl bg-raised px-2 py-1 text-xs" [disabled]="!online() || busy()" (click)="addSaved(s)">{{ s.name }} <b class="text-kcal">{{ s.kcal }}</b></button>
            }
          } @empty {
            <p class="muted">Tick ☆ save when adding a food to reuse it.</p>
          }
        </div>
      </section>

      <section class="card lg:col-span-2" aria-label="Log">
        <p class="label mb-1 text-muted">{{ day() === store.today() ? "Today's log" : 'Log' }}</p>
        <ul>
          @for (line of lines(); track line.id) {
            <li class="border-t border-line py-1.5 first:border-t-0">
              @if (editing() === line.id) {
                <div class="flex flex-wrap gap-1.5">
                  <input #eName class="field" [value]="line.name" maxlength="60" aria-label="Name" />
                  <input #eKcal class="field !w-[4.5rem]" [value]="line.kcal" inputmode="numeric" aria-label="kcal" />
                  <input #eProtein class="field !w-[5.5rem]" [value]="line.protein ?? ''" inputmode="decimal" aria-label="Protein" />
                  <input #eTime class="field !w-[6.5rem]" type="time" [value]="line.hhmm" aria-label="Time" />
                  <button type="button" class="btn" [disabled]="!online() || busy()" (click)="saveEdit(line, eName, eKcal, eProtein, eTime)">Save</button>
                  <button type="button" class="btn-quiet !text-kcal" [disabled]="!online() || busy()" (click)="remove(line)">{{ confirmDelete() === line.id ? 'Tap again' : 'Delete' }}</button>
                  <button type="button" class="btn-quiet" (click)="editing.set(null)">Cancel</button>
                </div>
              } @else {
                <div class="flex items-center justify-between gap-2 text-sm">
                  <span><span class="mr-1 text-xs" [class.text-kcal]="line.outside" [class.text-muted]="!line.outside">{{ line.outside ? '⚠️ ' : '' }}{{ line.time }}</span>{{ line.name }}</span>
                  <span class="flex items-center gap-2">{{ line.kcal }}
                    <button type="button" class="px-1 text-muted" [attr.aria-label]="'Edit ' + line.name" (click)="startEdit(line)">⋯</button></span>
                </div>
              }
            </li>
          } @empty {
            <li class="muted">Nothing logged yet.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class FoodPage {
  protected readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  private readonly clock = inject(Clock);
  private readonly toast = inject(ToastService);
  protected readonly online = inject(Online).online;
  protected readonly n = formatNumber;

  // Follows the app day across 4 AM while showing today; a day picked with ‹ › stays put.
  protected readonly day = linkedSignal<Day, Day>({
    source: this.store.today,
    computation: (today, prev) => (prev && prev.value !== prev.source ? prev.value : today),
  });
  // A time the user typed; cleared on a new day or after an add, so the field goes back to "now".
  protected readonly chosenTime = linkedSignal<Day, string | null>({ source: this.day, computation: () => null });
  protected readonly entries = signal<FoodEntryRow[]>([]);
  protected readonly saved = signal<SavedFoodRow[]>([]);
  protected readonly query = signal('');
  protected readonly saveIt = signal(false);
  protected readonly editSaved = signal(false);
  protected readonly editing = signal<string | null>(null);
  protected readonly confirmDelete = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly goal = computed(() => this.store.goals().kcalGoal);
  protected readonly total = computed(() => totals(this.entries()));
  protected readonly lines = computed(() => foodLines(this.entries(), this.store.goals()));
  protected readonly chips = computed(() => suggest(this.saved(), this.query()));
  protected readonly defaultTime = computed(() => defaultTime(this.day(), this.store.today(), this.clock.instant()));
  protected readonly dayText = computed(() => (this.day() === this.store.today() ? 'Today · ' : '') + dayLabel(this.day()));

  constructor() {
    effect(() => {
      const day = this.day();
      untracked(() => void this.loadDay(day));
    });
    this.api.loadSavedFoods().then((s) => this.saved.set(s), () => undefined);
  }

  private async loadDay(day: Day): Promise<void> {
    try {
      const rows = await this.api.loadFoodDay(day);
      if (this.day() === day) this.entries.set(rows);
    } catch {
      this.entries.set([]);
    }
  }

  private commit(rows: FoodEntryRow[]): void {
    this.entries.set(rows);
    this.store.setFoodDay(this.day(), rows);
  }

  protected shiftDay(n: number): void {
    this.editing.set(null);
    this.day.set(addDays(this.day(), n));
  }

  /** One food write at a time, so a double tap or an edit racing a delete can't interleave. */
  private async run(job: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await job();
    } catch {
      this.toast.show(SAVE_FAILED);
    } finally {
      this.busy.set(false);
    }
  }

  protected async add(event: Event, name: HTMLInputElement, kcal: HTMLInputElement, protein: HTMLInputElement, time: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const parsed = parseFood({ name: name.value, kcal: kcal.value, protein: protein.value, time: time.value }, this.day());
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    await this.run(async () => {
      const match = this.saved().find((s) => s.name.toLowerCase() === parsed.value.name.toLowerCase()) ?? null;
      let savedFoodId = match?.id ?? null;
      if (match) await this.bump(match);
      else if (this.saveIt()) {
        const s = await this.api.saveFood(parsed.value.name, parsed.value.kcal, parsed.value.proteinG);
        this.saved.update((list) => [...list, s]);
        savedFoodId = s.id;
      }
      const row = await this.api.addFood({ day: this.day(), ...parsed.value, savedFoodId });
      this.commit([...this.entries(), row]);
      name.value = '';
      kcal.value = '';
      protein.value = '';
      this.query.set('');
      this.saveIt.set(false);
      this.chosenTime.set(null);
    });
  }

  protected async addSaved(food: SavedFoodRow): Promise<void> {
    await this.run(async () => {
      const eatenAt = instantFor(this.day(), this.chosenTime() ?? this.defaultTime()).toISOString();
      const row = await this.api.addFood({ day: this.day(), eatenAt, name: food.name, kcal: food.kcal, proteinG: food.protein_g, savedFoodId: food.id });
      await this.bump(food);
      this.commit([...this.entries(), row]);
    });
  }

  private async bump(food: SavedFoodRow): Promise<void> {
    await this.api.bumpSavedFood(food.id, food.use_count + 1);
    this.saved.update((list) => list.map((s) => (s.id === food.id ? { ...s, use_count: s.use_count + 1 } : s)));
  }

  protected startEdit(line: FoodLine): void {
    this.confirmDelete.set(null);
    this.editing.set(line.id);
  }

  protected async saveEdit(line: FoodLine, name: HTMLInputElement, kcal: HTMLInputElement, protein: HTMLInputElement, time: HTMLInputElement): Promise<void> {
    const parsed = parseFood({ name: name.value, kcal: kcal.value, protein: protein.value, time: time.value }, this.day());
    if (!parsed.ok) return this.toast.show(parsed.error);
    await this.run(async () => {
      await this.api.updateFood(line.id, { day: this.day(), ...parsed.value, savedFoodId: null });
      this.commit(this.entries().map((e) => (e.id === line.id ? { ...e, name: parsed.value.name, kcal: parsed.value.kcal, protein_g: parsed.value.proteinG, eaten_at: parsed.value.eatenAt } : e)));
      this.editing.set(null);
    });
  }

  protected async remove(line: FoodLine): Promise<void> {
    if (this.confirmDelete() !== line.id) return this.confirmDelete.set(line.id);
    await this.run(async () => {
      await this.api.deleteFood(line.id);
      this.commit(this.entries().filter((e) => e.id !== line.id));
      this.editing.set(null);
    });
  }

  protected async deleteSaved(food: SavedFoodRow): Promise<void> {
    await this.run(async () => {
      await this.api.deleteSavedFood(food.id);
      this.saved.update((list) => list.filter((s) => s.id !== food.id));
    });
  }
}
