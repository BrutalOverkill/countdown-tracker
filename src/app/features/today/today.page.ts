import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ selector: 'app-today-page', changeDetection: ChangeDetectionStrategy.OnPush, template: `<h1 class="text-2xl font-extrabold">Today</h1>` })
export class TodayPage {}
