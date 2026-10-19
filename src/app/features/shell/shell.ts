import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Online } from '../../core/online';
import { TabBar } from './tab-bar';
import { Toast } from './toast';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TabBar, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex min-h-dvh max-w-5xl pt-[env(safe-area-inset-top)] lg:gap-6 lg:px-6">
      <app-tab-bar />
      <main class="min-w-0 flex-1 px-3 pb-28 pt-3 lg:pb-6">
        @if (!online.online()) {
          <p role="status" class="mb-3 rounded-xl bg-raised px-3 py-2 text-center text-sm font-semibold text-count">Offline — changes won't save</p>
        }
        <router-outlet />
      </main>
    </div>
    <app-toast />
  `,
})
export class Shell {
  protected readonly online = inject(Online);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.auth.session() === null) void this.router.navigateByUrl('/login');
    });
  }
}
