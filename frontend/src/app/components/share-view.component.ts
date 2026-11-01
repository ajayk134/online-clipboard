import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ExpiryLabelPipe } from '../pipes/expiry-label.pipe';
import { ShareService } from '../services/share.service';
import { ToastService } from '../services/toast.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-share-view',
  standalone: true,
  imports: [CommonModule, FormsModule, ExpiryLabelPipe],
  template: `
    <div class="share-page" *ngIf="meta()">
      <div class="share-header">
        <div class="share-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span>Clipboard</span>
        </div>
        <a class="share-link" [href]="shareUrl" target="_blank" rel="noopener">{{ shareUrl }}</a>
      </div>

      <div class="share-card">
        <div class="share-meta">
          <h1 class="share-title">{{ meta().title }}</h1>
          <div class="share-meta-row">
            <span class="meta-chip">{{ meta().contentType }}</span>
            @if (meta().language) {
              <span class="meta-chip">{{ meta().language }}</span>
            }
            @if (meta().isOneTime) {
              <span class="meta-chip meta-chip--onetime">One-time</span>
            }
            @if (meta().expiresAt) {
              <span class="meta-chip">{{ meta().expiresAt | expiryLabel }}</span>
            }
          </div>
          <p class="share-excerpt">{{ meta().excerpt }}</p>
        </div>

        <div class="share-access" *ngIf="!content() && !unlocked()">
          <div class="access-state" *ngIf="meta().hasPassword && !unlocked()">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h3>Password protected</h3>
            <p>Enter the password to view this clip.</p>
            <form class="password-form" (submit)="unlock($event)">
              <input type="password" class="form-input" [(ngModel)]="password" placeholder="Password" aria-label="Share password" required />
              <button type="submit" class="btn btn--primary">Unlock</button>
            </form>
          </div>
          <div class="access-state" *ngIf="!meta().hasPassword && !unlocked()">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
            </svg>
            <h3>View clip</h3>
            <p>This clip is ready to view.</p>
            <button class="btn btn--primary" (click)="access()">Open</button>
          </div>
        </div>

        <div class="share-content" *ngIf="content()">
          <h3 class="content-title">{{ meta().title }}</h3>
          @if (meta().contentType === 'code') {
            <pre class="code-block"><code>{{ content() }}</code></pre>
          } @else if (meta().contentType === 'richtext') {
            <div class="rich-block" [innerHTML]="content()"></div>
          } @else {
            <div class="text-block">{{ content() }}</div>
          }
          <div class="content-actions">
            <button class="btn btn--outline" (click)="copyContent()">Copy content</button>
            <button class="btn btn--primary" (click)="downloadContent()">Download</button>
          </div>
          @if (meta().isOneTime) {
            <p class="burn-notice">⚠ This is a one-time clip. It will be consumed after viewing.</p>
          }
        </div>

        <div class="share-expired" *ngIf="expiredOrBurned">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <h3>{{ burned ? 'Clip consumed' : 'Expired' }}</h3>
          <p>{{ burned ? 'This one-time clip has already been viewed.' : 'This clip is no longer available.' }}</p>
        </div>
      </div>
    </div>
    <div class="share-loading" *ngIf="loading()">Loading…</div>
  `,
  styleUrls: ['./share-view.component.scss'],
})
export class ShareViewComponent {
  readonly shareService = inject(ShareService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly meta = signal<any>(null);
  protected readonly content = signal<string | null>(null);
  protected readonly unlocked = signal(false);
  protected readonly loading = signal(true);
  protected readonly password = '';

  constructor() {
    const token = this.route.snapshot.paramMap.get('token');
    if (token) void this.loadMeta(token);
  }

  async loadMeta(token: string): Promise<void> {
    try {
      const m = await this.shareService.getMeta(token);
      this.meta.set(m);
      if (!m.available || m.expired) {
        this.loading.set(false);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async access(): Promise<void> {
    try {
      const res = await this.shareService.access(this.route.snapshot.paramMap.get('token')!, this.password || undefined);
      this.content.set(res.content);
      this.unlocked.set(true);
    } catch (e: any) {
      this.toast.error(e?.message || 'Access denied');
    }
  }

  async unlock(event: Event): Promise<void> {
    event.preventDefault();
    await this.access();
  }

  get expiredOrBurned(): boolean {
    const m = this.meta();
    return !!(m && (m.expired || !m.available));
  }

  get burned(): boolean {
    const m = this.meta();
    return !!(m && m.available === false && !m.expired);
  }

  get shareUrl(): string {
    const token = this.route.snapshot.paramMap.get('token');
    return `${window.location.origin}/s/${token ?? ''}`;
  }

  async copyContent(): Promise<void> {
    const c = this.content();
    if (c) { await navigator.clipboard.writeText(c); this.toast.success('Copied'); }
  }

  async downloadContent(): Promise<void> {
    const c = this.content();
    const m = this.meta();
    if (!c) return;
    const blob = new Blob([c], { type: m?.contentType === 'code' ? 'text/plain' : 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m?.title || 'clip'}.${m?.contentType === 'code' ? 'txt' : 'html'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
