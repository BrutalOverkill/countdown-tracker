import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { AppearanceSection } from './appearance-section';
import { CountdownsSection } from './countdowns-section';
import { FastingSection } from './fasting-section';
import { HabitsSection } from './habits-section';
import { ShortcutSection } from './shortcut-section';
import { TargetsSection } from './targets-section';

@Component({
  selector: 'app-settings-page',
  imports: [AppearanceSection, CountdownsSection, HabitsSection, TargetsSection, FastingSection, ShortcutSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-3 px-1 text-2xl font-extrabold">Settings</h1>
    <div class="grid gap-2 lg:grid-cols-2">
      <app-countdowns-section />
      <app-habits-section />
      <app-targets-section />
      <app-fasting-section />
      <app-shortcut-section />
      <app-appearance-section />
      <section class="card" aria-label="Account">
        <p class="label mb-1 text-muted">Account</p>
        <p class="flex items-center justify-between gap-2 text-sm">
          <span class="truncate">{{ auth.email() }}</span>
          <button type="button" class="btn-quiet" (click)="auth.signOut()">Sign out</button>
        </p>
      </section>
    </div>
  `,
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
}
