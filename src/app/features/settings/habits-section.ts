import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { HABIT_PALETTE, nextColor } from '../../domain/palette';
import { bySortOrder } from '../../domain/visibility';
import type { Frequency, Habit, Slot } from '../../domain/types';
import { moved, parseHabit } from './settings-forms';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_LABEL: Record<Slot, string> = { morning: 'morning', night: 'night', anytime: 'anytime' };

@Component({
  selector: 'app-habits-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Habits">
      <fieldset class="m-0 min-w-0 border-0 p-0" [disabled]="store.saving()">
      <p class="label mb-1 text-routine">Habits</p>
      @for (h of list(); track h.id; let i = $index, first = $first, last = $last) {
        <div class="border-t border-line py-1.5 first:border-t-0">
          @if (editing() === h.id) {
            <div class="flex flex-wrap gap-1.5">
              @if (h.source === 'manual') {
                <div class="flex w-full gap-1.5">
                  <input #eEmoji class="field !w-14 shrink-0 text-center" [value]="h.emoji" maxlength="8" aria-label="Emoji" />
                  <input #eName class="field min-w-0 flex-1" [value]="h.name" maxlength="40" aria-label="Name" />
                </div>
                <div class="flex w-full gap-1.5">
                  <select #eFreq class="field min-w-0 flex-1" aria-label="Frequency" (change)="editFreq.set(eFreq.value)">
                    <option value="daily" [selected]="h.frequency === 'daily'">Daily</option>
                    <option value="weekly" [selected]="h.frequency === 'weekly'">Weekly</option>
                  </select>
                  <select #eSlot class="field min-w-0 flex-1" aria-label="Time of day">
                    @for (s of slots; track s) {
                      <option [value]="s" [selected]="h.slot === s">{{ slotLabel[s] }}</option>
                    }
                  </select>
                  <select #eDay class="field min-w-0 flex-1" aria-label="Weekday (weekly habits)" [hidden]="editFreq() !== 'weekly'">
                    @for (d of weekdays; track $index) {
                      <option [value]="$index" [selected]="$index === (h.weekday ?? 0)">{{ d }}</option>
                    }
                  </select>
                </div>
                <div class="flex w-full flex-wrap gap-1">
                  @for (c of palette; track c) {
                    <button type="button" class="size-6 rounded-full" [style.background]="c" [attr.aria-label]="'Colour ' + c" [attr.aria-pressed]="color() === c"
                      [class.ring-2]="color() === c" [class.ring-white]="color() === c" (click)="color.set(c)"></button>
                  }
                </div>
                <button type="button" class="btn" (click)="save(h, eName.value, eEmoji.value, eFreq.value, eSlot.value, eDay.value)">Save</button>
              } @else {
                <p class="muted w-full">{{ h.emoji }} {{ h.name }} fills in automatically, so only its position can change.</p>
              }
              <button type="button" class="btn-quiet !text-kcal" (click)="archive(h)">{{ confirming() === h.id ? 'Tap again' : 'Archive' }}</button>
              <button type="button" class="btn-quiet" (click)="editing.set(null)">Cancel</button>
            </div>
          } @else {
            <div class="flex items-center gap-2 text-sm">
              <span class="size-2.5 shrink-0 rounded-full" [style.background]="h.color"></span>
              <button type="button" class="flex-1 text-left" (click)="startEdit(h)">{{ h.emoji }} {{ h.name }}</button>
              <span class="muted">{{ meta(h) }}</span>
              <button type="button" class="px-1 text-muted disabled:opacity-20" [attr.aria-label]="'Move ' + h.name + ' up'" [disabled]="first" (click)="move(i, -1)">▲</button>
              <button type="button" class="px-1 text-muted disabled:opacity-20" [attr.aria-label]="'Move ' + h.name + ' down'" [disabled]="last" (click)="move(i, 1)">▼</button>
            </div>
          }
        </div>
      }
      <form class="mt-2 grid gap-1.5 border-t border-line pt-2" (submit)="add($event, nName, nEmoji, nFreq, nSlot, nDay)">
        <div class="flex gap-1.5">
          <input #nEmoji class="field !w-14 shrink-0 text-center" placeholder="✅" maxlength="8" aria-label="New habit emoji" />
          <input #nName class="field min-w-0 flex-1" placeholder="+ Add habit" maxlength="40" aria-label="New habit name" />
        </div>
        <div class="flex gap-1.5">
          <select #nFreq class="field min-w-0 flex-1" aria-label="New habit frequency" (change)="newFreq.set(nFreq.value)"><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
          <select #nSlot class="field min-w-0 flex-1" aria-label="New habit time of day">
            @for (s of slots; track s) {
              <option [value]="s" [selected]="s === 'anytime'">{{ slotLabel[s] }}</option>
            }
          </select>
          <select #nDay class="field min-w-0 flex-1" aria-label="New habit weekday" [hidden]="newFreq() !== 'weekly'">
            @for (d of weekdays; track $index) {
              <option [value]="$index">{{ d }}</option>
            }
          </select>
          <button class="btn shrink-0" type="submit">Add</button>
        </div>
      </form>
      @if (error(); as e) {
        <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
      }
      </fieldset>
    </section>
  `,
})
export class HabitsSection {
  protected readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly palette = HABIT_PALETTE;
  protected readonly weekdays = WEEKDAYS;
  protected readonly slots: Slot[] = ['morning', 'night', 'anytime'];
  protected readonly slotLabel = SLOT_LABEL;
  protected readonly editing = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly color = signal(HABIT_PALETTE[0]);
  protected readonly error = signal<string | null>(null);
  protected readonly newFreq = signal('daily');
  protected readonly editFreq = signal('daily');

  protected readonly list = computed(() =>
    this.store.habits().filter((h) => h.archivedDay === null || h.archivedDay > this.store.today()).sort(bySortOrder),
  );

  protected meta(h: Habit): string {
    if (h.source !== 'manual') return 'Auto ⚡';
    return h.frequency === 'weekly' ? `Weekly · ${WEEKDAYS[h.weekday ?? 0].slice(0, 3)}` : `Daily · ${SLOT_LABEL[h.slot]}`;
  }

  protected startEdit(h: Habit): void {
    this.confirming.set(null);
    this.color.set(h.color.toUpperCase());
    this.editFreq.set(h.frequency);
    this.editing.set(h.id);
  }

  protected async save(h: Habit, name: string, emoji: string, frequency: string, slot: string, weekday: string): Promise<void> {
    const parsed = parseHabit({ name, emoji, frequency: frequency as Frequency, slot: slot as Slot, weekday });
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const v = parsed.value;
    if (await this.store.guard(() => this.api.updateHabit(h.id, { ...v, color: this.color(), source: h.source, sortOrder: h.sortOrder }))) this.editing.set(null);
  }

  protected async add(event: Event, name: HTMLInputElement, emoji: HTMLInputElement, freq: HTMLSelectElement, slot: HTMLSelectElement, day: HTMLSelectElement): Promise<void> {
    event.preventDefault();
    const parsed = parseHabit({ name: name.value, emoji: emoji.value, frequency: freq.value as Frequency, slot: slot.value as Slot, weekday: day.value });
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const habits = this.store.habits();
    const sortOrder = Math.max(0, ...habits.map((h) => h.sortOrder)) + 1;
    const color = nextColor(habits.filter((h) => h.archivedDay === null).map((h) => h.color));
    if (await this.store.guard(() => this.api.addHabit({ ...parsed.value, color, source: 'manual', sortOrder }))) {
      name.value = '';
      emoji.value = '';
    }
  }

  protected async archive(h: Habit): Promise<void> {
    if (this.confirming() !== h.id) return this.confirming.set(h.id);
    this.confirming.set(null);
    if (await this.store.guard(() => this.api.archiveHabit(h.id))) this.editing.set(null);
  }

  protected async move(index: number, delta: number): Promise<void> {
    const ids = moved(this.list().map((h) => h.id), index, delta);
    await this.store.guard(() => this.api.setSortOrders(ids));
  }
}
