import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { Clock } from '../../core/clock';
import { dayLabel, greetingName } from '../../core/format';
import { Online } from '../../core/online';
import { ThemeService } from '../../core/theme.service';
import { TrackerStore } from '../../data/tracker.store';
import { CaloriesTile } from './calories-tile';
import { ChallengesCard } from './challenges-card';
import { CountdownsCard } from './countdowns-card';
import { DueCard } from './due-card';
import { FastingCard } from './fasting-card';
import { RoutinesCard } from './routines-card';
import { ScoreCard } from './score-card';
import { StepsTile } from './steps-tile';
import { buildTodayVm } from './today.vm';
import { WorkoutCard } from './workout-card';

@Component({
  selector: 'app-today-page',
  imports: [ScoreCard, CountdownsCard, DueCard, FastingCard, StepsTile, CaloriesTile, WorkoutCard, RoutinesCard, ChallengesCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = vm();
    <header class="mb-3 flex items-center justify-between gap-2 px-1">
      <div class="min-w-0">
        <p class="label text-muted">{{ header() }}</p>
        <h1 class="num mt-1 truncate text-[28px] matrix:text-[21px]">let's get it{{ name() ? ', ' + name() : '' }}</h1>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        @if (isIos) {
          <a href="shortcuts://run-shortcut?name=Countdown%20Sync" class="btn-quiet press !px-3 !py-2 text-xs" (click)="store.markStale()">↻ Sync</a>
        }
        <button type="button" aria-label="Switch theme" (click)="theme.toggle()"
          class="press grid size-10 place-items-center rounded-full bg-accent text-lg text-black
                 matrix:rounded-xl matrix:border matrix:border-line matrix:bg-black matrix:text-white">◐</button>
      </div>
    </header>
    @for (d of v.due; track d.habit.id) {
      <app-due-card class="mb-2" [due]="d" [disabled]="!online()" (done)="store.toggleCheck($event, v.today)" />
    }
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <app-countdowns-card class="col-span-2" [tiles]="v.countdowns" />
      <app-score-card [score]="v.score" [perfect]="v.perfect" [streak]="v.streak" />
      <app-steps-tile [steps]="v.steps" [goal]="v.stepGoal" [lastSyncAt]="v.lastSyncAt" [stale]="v.syncStale" />
      @if (v.fasting; as f) {
        <app-fasting-card [fasting]="f" />
      }
      <app-calories-tile [kcal]="v.kcal" [goal]="v.kcalGoal" />
      <app-routines-card class="col-span-2" [groups]="v.routines" [weekly]="v.weekly" [intervals]="v.intervals" [today]="v.today" [done]="v.routinesDone" [total]="v.routinesTotal"
        [disabled]="!online()" (toggle)="store.toggleCheck($event, v.today)" />
      <app-workout-card class="col-span-2" [workouts]="v.workouts" [disabled]="!online()" (trained)="store.addManualWorkout()" (remove)="store.removeWorkout($event)" />
      @for (g of v.challengeGroups; track g.countdownId) {
        <app-challenges-card class="col-span-2" [group]="g" />
      }
    </div>
  `,
})
export class TodayPage {
  protected readonly store = inject(TrackerStore);
  protected readonly theme = inject(ThemeService);
  private readonly clock = inject(Clock);
  private readonly auth = inject(AuthService);
  protected readonly online = inject(Online).online;
  protected readonly isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  protected readonly header = computed(() => dayLabel(this.store.today()).toUpperCase());
  protected readonly name = computed(() => greetingName(this.auth.email()));
  protected readonly vm = computed(() =>
    buildTodayVm({
      habits: this.store.habits(), countdowns: this.store.countdowns(), challenges: this.store.challenges(),
      ctx: this.store.ctx(), minute: this.clock.minute(), lastSyncAt: this.store.lastSyncAt(), now: this.clock.instant(),
    }),
  );
}
