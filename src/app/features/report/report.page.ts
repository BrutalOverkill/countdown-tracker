import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ selector: 'app-report-page', changeDetection: ChangeDetectionStrategy.OnPush, template: `<h1 class="text-2xl font-extrabold">Report</h1>` })
export class ReportPage {}
