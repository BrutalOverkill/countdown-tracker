import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ selector: 'app-settings-page', changeDetection: ChangeDetectionStrategy.OnPush, template: `<h1 class="text-2xl font-extrabold">Settings</h1>` })
export class SettingsPage {}
