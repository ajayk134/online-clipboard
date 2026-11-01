import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastType } from '../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      @for (t of toast.all(); track t.id) {
        <div
          class="toast toast--{{ t.type }}"
          role="alert"
          aria-label="{{ t.message }}"
        >
          <div class="toast-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              @if (t.type === 'success') { <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline> }
              @if (t.type === 'error') { <circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line> }
              @if (t.type === 'warning') { <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12" y2="17"></line> }
              @if (t.type === 'info') { <circle cx="12" cy="12" r="10"></circle><path d="M12 16v-6"></path><path d="M12 8h.01"></path> }
            </svg>
          </div>
          <div class="toast-message">{{ t.message }}</div>
          <button class="toast-close" (click)="toast.remove(t.id)" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styleUrls: ['./toast.component.scss'],
})
export class ToastComponent {
  readonly toast = inject(ToastService);
}
