import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { daysBetween } from '@shared/days';
import { dayLabelWithYear } from '../../core/format';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { defaultTarget } from '../../domain/challenges';
import { bySortOrder, isActiveOn } from '../../domain/visibility';
import type { Challenge, Countdown } from '../../domain/types';
import { daysLeft, parseChallengeTarget, parseCountdown } from './settings-forms';

@Component({
  selector: 'app-countdowns-section',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-label="Countdowns">
      <fieldset class="m-0 min-w-0 border-0 p-0" [disabled]="store.saving()">
      <p class="label mb-1 text-count">Countdowns</p>
      @for (c of upcoming(); track c.id) {
        <div class="border-t border-line py-2 first:border-t-0" role="group" [attr.aria-label]="c.title">
          @if (editing() === c.id) {
            <div class="flex flex-wrap gap-1.5">
              <input #eEmoji class="field !w-14 text-center" [value]="c.emoji" maxlength="8" aria-label="Emoji" />
              <input #eTitle class="field flex-1" [value]="c.title" maxlength="40" aria-label="Title" />
              <input #eDate class="field !w-40" type="date" [value]="c.targetDate" aria-label="Date" />
              <button type="button" class="btn" (click)="save(c.id, eTitle.value, eEmoji.value, eDate.value)">Save</button>
              <button type="button" class="btn-quiet !text-kcal" (click)="remove(c.id)">{{ confirming() === c.id ? 'Tap again' : 'Delete' }}</button>
              <button type="button" class="btn-quiet" (click)="editing.set(null)">Cancel</button>
            </div>
          } @else {
            <button type="button" class="flex w-full justify-between text-sm" (click)="editing.set(c.id)">
              <span>{{ c.emoji }} {{ c.title }}</span><span class="muted">{{ label(c.targetDate) }}</span>
            </button>
          }
          <div class="mt-1 pl-3">
            @for (ch of challengesFor(c.id); track ch.id) {
              <div class="flex items-center justify-between text-xs text-muted">
                <span>🏁 {{ habitName(ch.habitId) }} on {{ ch.targetDays }} of {{ windowDays(ch, c) }} days</span>
                <button type="button" class="underline" (click)="removeChallenge(ch.id)">{{ confirming() === ch.id ? 'Tap again' : 'Remove' }}</button>
              </div>
            }
            @if (challengesFor(c.id).length < 3 && left(c) > 0) {
              @if (adding() === c.id) {
                <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <select #chHabit class="field !w-auto !py-1" aria-label="Challenge habit">
                    @for (h of dailyHabits(); track h.id) {
                      <option [value]="h.id">{{ h.name }}</option>
                    }
                  </select>
                  on <input #chTarget class="field !w-14 !py-1" inputmode="numeric" [value]="suggested(c)" aria-label="Target days" /> of {{ left(c) }} days
                  <button type="button" class="btn !py-1" (click)="addChallenge(c, chHabit.value, chTarget.value)">Add</button>
                  <button type="button" class="btn-quiet !py-1" (click)="adding.set(null)">Cancel</button>
                </div>
              } @else {
                <button type="button" class="mt-1 text-xs font-semibold text-count" (click)="adding.set(c.id)">+ Add challenge</button>
              }
            }
          </div>
        </div>
      }
      <form class="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2" (submit)="add($event, nEmoji, nTitle, nDate)">
        <input #nEmoji class="field !w-14 text-center" placeholder="🎯" maxlength="8" aria-label="New countdown emoji" />
        <input #nTitle class="field flex-1" placeholder="+ Add countdown" maxlength="40" aria-label="New countdown title" />
        <input #nDate class="field !w-40" type="date" aria-label="New countdown date" />
        <button class="btn" type="submit">Add</button>
      </form>
      @if (error(); as e) {
        <p class="mt-1 text-sm text-kcal" role="alert">{{ e }}</p>
      }
      </fieldset>
      @if (past().length) {
        <p class="label mt-3 text-muted">Past</p>
        @for (c of past(); track c.id) {
          <a class="flex justify-between py-1 text-sm" [routerLink]="['/report', c.id]"><span>{{ c.emoji }} {{ c.title }}</span><span class="muted">report card →</span></a>
        }
      }
    </section>
  `,
})
export class CountdownsSection {
  protected readonly store = inject(TrackerStore);
  private readonly api = inject(TrackerApi);
  protected readonly editing = signal<string | null>(null);
  protected readonly adding = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly label = dayLabelWithYear;

  protected readonly upcoming = computed(() => this.store.countdowns().filter((c) => c.targetDate >= this.store.today()));
  protected readonly past = computed(() => this.store.countdowns().filter((c) => c.targetDate < this.store.today()).reverse());
  protected readonly dailyHabits = computed(() => this.store.habits().filter((h) => h.frequency === 'daily' && isActiveOn(h, this.store.today())).sort(bySortOrder));

  protected challengesFor(id: string): Challenge[] {
    return this.store.challenges().filter((ch) => ch.countdownId === id);
  }

  protected habitName(id: string): string {
    return this.store.habits().find((h) => h.id === id)?.name ?? 'Archived habit';
  }

  protected windowDays(ch: Challenge, c: Countdown): number {
    return daysBetween(ch.startDay, c.targetDate);
  }

  protected left(c: Countdown): number {
    return daysLeft(c.targetDate, this.store.today());
  }

  protected suggested(c: Countdown): number {
    return defaultTarget(this.left(c));
  }

  protected async add(event: Event, emoji: HTMLInputElement, title: HTMLInputElement, date: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const parsed = parseCountdown({ title: title.value, emoji: emoji.value, date: date.value }, this.store.today());
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const { title: t, emoji: e, targetDate } = parsed.value;
    if (await this.store.guard(() => this.api.addCountdown(t, e, targetDate))) {
      emoji.value = '';
      title.value = '';
      date.value = '';
    }
  }

  protected async save(id: string, title: string, emoji: string, date: string): Promise<void> {
    const parsed = parseCountdown({ title, emoji, date }, this.store.today());
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const v = parsed.value;
    if (await this.store.guard(() => this.api.updateCountdown(id, v.title, v.emoji, v.targetDate))) this.editing.set(null);
  }

  protected async remove(id: string): Promise<void> {
    if (this.confirming() !== id) return this.confirming.set(id);
    this.confirming.set(null);
    await this.store.guard(() => this.api.deleteCountdown(id));
  }

  protected async addChallenge(c: Countdown, habitId: string, raw: string): Promise<void> {
    const parsed = parseChallengeTarget(raw, this.left(c));
    if (!parsed.ok) return this.error.set(parsed.error);
    this.error.set(null);
    const target = parsed.value;
    if (await this.store.guard(() => this.api.addChallenge(c.id, habitId, target, this.store.today()))) this.adding.set(null);
  }

  protected async removeChallenge(id: string): Promise<void> {
    if (this.confirming() !== id) return this.confirming.set(id);
    this.confirming.set(null);
    await this.store.guard(() => this.api.deleteChallenge(id));
  }
}
