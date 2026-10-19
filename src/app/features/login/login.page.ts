import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
      <h1 class="num text-5xl">Countdown<span class="text-accent">.</span></h1>
      <p class="muted">Sign in to your tracker.</p>
      <form class="flex flex-col gap-3" (submit)="submit($event, email.value, password.value)">
        <input #email class="field" type="email" name="email" autocomplete="username" placeholder="Email" required />
        <input #password class="field" type="password" name="password" autocomplete="current-password" placeholder="Password" required />
        <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
        @if (error(); as e) {
          <p class="text-sm text-kcal" role="alert">{{ e }}</p>
        }
      </form>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(event: Event, email: string, password: string): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    const problem = await this.auth.signIn(email.trim(), password);
    this.busy.set(false);
    if (problem) this.error.set(problem);
    else await this.router.navigateByUrl('/today');
  }
}
