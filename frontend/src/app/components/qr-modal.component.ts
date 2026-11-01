import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-qr-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="qr-overlay" (click)="close()" *ngIf="open"></div>
    <div class="qr-modal" *ngIf="open" role="dialog" aria-modal="true" aria-label="QR Code">
      <div class="qr-header">
        <h3>QR Code</h3>
        <button class="qr-close" (click)="close()" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <div class="qr-body">
        <div class="qr-code">
          <img [src]="qrUrl" alt="QR code" />
        </div>
        <div class="qr-label">{{ label }}</div>
        <button class="qr-download" (click)="downloadQr()" aria-label="Download QR">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Download
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./qr-modal.component.scss'],
})
export class QrModalComponent {
  @Input() open = false;
  @Output() openChange = new EventEmitter<boolean>();
  @Input() qrUrl = '';
  @Input() label = 'QR Code';

  close(): void {
    this.open = false;
    this.openChange.emit(false);
    this.qrUrl = '';
  }

  downloadQr(): void {
    if (!this.qrUrl) return;
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = this.qrUrl;
    link.click();
  }
}
