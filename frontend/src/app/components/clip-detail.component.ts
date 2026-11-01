import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ExpiryLabelPipe } from '../pipes/expiry-label.pipe';
import { TimeAgoPipe } from '../pipes/time-ago.pipe';
import { ClipService } from '../services/clip.service';
import { QrService } from '../services/qr.service';
import { QrModalComponent } from './qr-modal.component';
import { ToastService } from '../services/toast.service';
import { Clip } from '../models';

@Component({
  selector: 'app-clip-detail',
  standalone: true,
  imports: [CommonModule, QrModalComponent, ExpiryLabelPipe, TimeAgoPipe],
  template: `
    <div class="detail-page" *ngIf="clip()">
      <div class="detail-bar">
        <button class="btn btn--outline" (click)="goBack()">← Back</button>
        <h1 class="detail-title">{{ clip()!.title }}</h1>
        <div class="detail-spacer"></div>
        <div class="detail-actions">
          <button class="icon-btn" (click)="copyContent()" title="Copy content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="icon-btn" (click)="openQr()" title="QR code">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
            </svg>
          </button>
          <button class="btn btn--primary" (click)="shareClip()">Share</button>
          <button class="btn btn--danger" (click)="remove()">Delete</button>
        </div>
      </div>

      <div class="detail-meta">
        <span class="meta-chip">{{ clip()!.contentType }}</span>
        @if (clip()!.language) {
          <span class="meta-chip">{{ clip()!.language }}</span>
        }
        @if (clip()!.isPinned) {
          <span class="meta-chip meta-chip--pin">Pinned</span>
        }
        @if (clip()!.shareEnabled) {
          <span class="meta-chip meta-chip--share">Shared</span>
        }
        @if (clip()!.expiresAt) {
          <span class="meta-chip">{{ clip()!.expiresAt | expiryLabel }}</span>
        }
        <span class="meta-chip">{{ clip()!.updatedAt | timeAgo }}</span>
      </div>

      <div class="detail-content">
        @if (clip()!.contentType === 'code') {
          <pre class="code-block"><code>{{ clip()!.content }}</code></pre>
        } @else if (clip()!.contentType === 'richtext') {
          <div class="rich-block" [innerHTML]="clip()!.content"></div>
        } @else {
          <div class="text-block">{{ clip()!.content }}</div>
        }
      </div>

      <div class="detail-footer">
        <div class="detail-tags">
          @for (tag of clip()!.tags; track tag) {
            <span class="tag">{{ tag }}</span>
          }
        </div>
        <div class="detail-stats">
          <span class="stat">Copies: {{ clip()!.copyCount }}</span>
          <span class="stat">Views: {{ clip()!.viewCount }}</span>
        </div>
      </div>

      <app-qr-modal [(open)]="qrOpen" [qrUrl]="qrDataUrl()" [label]="'Share QR'"></app-qr-modal>
    </div>
    <div class="empty" *ngIf="!clip() && loading()">Loading…</div>
  `,
  styleUrls: ['./clip-detail.component.scss'],
})
export class ClipDetailComponent {
  readonly clipService = inject(ClipService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly qrService = inject(QrService);

  protected readonly clip = signal<Clip | null>(null);
  protected readonly loading = signal(true);
  protected readonly qrOpen = signal(false);
  protected readonly qrData = signal<string | null>(null);

  protected readonly qrDataUrl = (): string => this.qrData() ?? '';

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    void this.load(id);
  }

  async load(id: number): Promise<void> {
    this.loading.set(true);
    try {
      this.clip.set(await this.clipService.getClip(id));
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void { this.router.navigate(['/app']); }

  async copyContent(): Promise<void> {
    await navigator.clipboard.writeText(this.clip()!.content);
    this.toast.success('Content copied');
  }

  async openQr(): Promise<void> {
    const clip = this.clip();
    if (!clip) return;
    const shareUrl = clip.shareToken
      ? `${window.location.origin}/s/${clip.shareToken}`
      : `${window.location.origin}/app/detail/${clip.id}`;
    this.qrData.set(await this.qrService.toDataUrl(shareUrl));
    this.qrOpen.set(true);
  }

  async shareClip(): Promise<void> {
    try {
      const res = await this.clipService.shareClip(this.clip()!.id, { enabled: true });
      if (res.shareToken) {
        const shareUrl = `${window.location.origin}/s/${res.shareToken}`;
        await navigator.clipboard.writeText(shareUrl);
        this.toast.success('Share link copied');
      }
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to share');
    }
  }

  async remove(): Promise<void> {
    if (!confirm('Delete this clip?')) return;
    try {
      await this.clipService.deleteClip(this.clip()!.id);
      this.toast.success('Clip deleted');
      this.router.navigate(['/app']);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to delete');
    }
  }
}
