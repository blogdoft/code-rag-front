import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.html',
  host: {
    class: 'pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4',
  },
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);
}
