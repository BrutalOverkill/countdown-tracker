import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdates } from './core/app-updates';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {
  // Created at startup so the theme is applied on the login screen too.
  private readonly theme = inject(ThemeService);
  // Switches to a newly deployed version on its own.
  private readonly updates = inject(AppUpdates);
}
