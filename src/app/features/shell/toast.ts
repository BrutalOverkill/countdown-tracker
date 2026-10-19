import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.message(); as m) {
      <div role="status" class="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[90%] rounded-xl bg-raised px-4 py-2 text-sm shadow-lg lg:bottom-6">{{ m }}</div>
    }
  `,
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
