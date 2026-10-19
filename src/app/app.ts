import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-dvh place-items-center text-center">
      <div>
        <h1 class="text-3xl font-black">Countdown</h1>
        <p class="muted">Setting up…</p>
      </div>
    </main>
  `,
})
export class App {}
