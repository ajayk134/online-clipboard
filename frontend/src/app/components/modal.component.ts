import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [],
  template: `
    @if (open) {
      <div class="modal-overlay" (click)="onBackdropClick()"></div>
      <div class="modal" role="dialog" aria-modal="true" aria-label="{{ title || 'Dialog' }}">
        <div class="modal-header">
          <h2 class="modal-title">{{ title }}</h2>
          <button class="modal-close" (click)="close.emit()" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <ng-content></ng-content>
        </div>
        @if (actions) {
          <div class="modal-actions">{{ actions }}</div>
        }
      </div>
    }
  `,
  styleUrl: './modal.component.scss',
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() actions: string | null = null;
  @Output() close = new EventEmitter<void>();

  private onBackdropClick(): void {
    this.close.emit();
  }
}
