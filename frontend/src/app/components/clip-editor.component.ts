import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { ClipService } from '../services/clip.service';
import { ToastService } from '../services/toast.service';
import { Clip, ContentType } from '../models';

const EXPIRY_PRESETS: { label: string; value: string | null }[] = [
  { label: 'Never', value: null },
  { label: '1 hour', value: '1hour' },
  { label: '1 day', value: '1day' },
  { label: '1 week', value: '1week' },
  { label: '1 month', value: '1month' },
];

@Component({
  selector: 'app-clip-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="editor-page">
      <div class="editor-bar">
        <button class="btn btn--outline" (click)="goBack()">← Back</button>
        <h1 class="editor-title">{{ isNew() ? 'New clip' : 'Edit clip' }}</h1>
        <div class="editor-spacer"></div>
        <button class="btn btn--primary" (click)="save()">Save clip</button>
      </div>

      <div class="editor-body">
        <div class="editor-form">
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" class="form-input" [(ngModel)]="form.title" placeholder="Clip title" aria-label="Title" />
          </div>

          <div class="form-group">
            <label class="form-label">Content type</label>
            <div class="type-tabs">
              <button class="type-tab" [class.active]="form.contentType === 'text'" (click)="setType('text')">Text</button>
              <button class="type-tab" [class.active]="form.contentType === 'richtext'" (click)="setType('richtext')">Rich text</button>
              <button class="type-tab" [class.active]="form.contentType === 'code'" (click)="setType('code')">Code</button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Content</label>
            <div class="content-editor">
              @if (form.contentType === 'code') {
                <select class="form-input lang-select" [(ngModel)]="form.language" aria-label="Language">
                  <option value="text">Plain text</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="python">Python</option>
                  <option value="html">HTML</option>
                  <option value="css">CSS</option>
                  <option value="json">JSON</option>
                  <option value="bash">Bash</option>
                  <option value="sql">SQL</option>
                </select>
                <textarea class="form-textarea code-area" [(ngModel)]="form.content" placeholder="Enter code…" aria-label="Code content" spellcheck="false"></textarea>
              } @else if (form.contentType === 'richtext') {
                <div class="rich-editor" contenteditable="true" (input)="onRichInput($event)" [innerHTML]="richHtml()" aria-label="Rich text content" role="textbox"></div>
              } @else {
                <textarea class="form-textarea" [(ngModel)]="form.content" placeholder="Enter text…" aria-label="Text content"></textarea>
              }
            </div>
            <div class="char-count">{{ (form.content || '').length }} chars</div>
          </div>

          <div class="form-group">
            <label class="form-label">Tags (comma separated)</label>
            <input type="text" class="form-input" [(ngModel)]="tagsInput" placeholder="tag1, tag2" aria-label="Tags" />
          </div>

          <div class="form-group form-check">
            <label class="form-check-label">
              <input type="checkbox" [(ngModel)]="form.isPinned" /> Pin to top
            </label>
          </div>
          <div class="form-group form-check">
            <label class="form-check-label">
              <input type="checkbox" [(ngModel)]="form.isFavorite" /> Mark as favorite
            </label>
          </div>

          <div class="form-group">
            <label class="form-label">Expires</label>
            <select class="form-select" [(ngModel)]="expiryPreset" (change)="onExpiryChange()">
              @for (p of EXPIRY_PRESETS; track p.value) {
                <option [value]="p.value">{{ p.label }}</option>
              }
            </select>
          </div>

          <div class="form-group share-group">
            <label class="form-label">Share settings</label>
            <div class="form-check">
              <label class="form-check-label">
                <input type="checkbox" [(ngModel)]="form.share" /> Enable public sharing
              </label>
            </div>
            <div class="form-check" [class.disabled]="!form.share">
              <label class="form-check-label">
                <input type="checkbox" [(ngModel)]="form.shareOneTime" [disabled]="!form.share" /> One-time read (burn after reading)
              </label>
            </div>
            <div class="form-check" [class.disabled]="!form.share">
              <label class="form-check-label">
                <input type="checkbox" [(ngModel)]="hasPassword" [disabled]="!form.share" /> Password protect
              </label>
            </div>
            <div class="password-input" [class.hidden]="!form.share || !hasPassword">
              <input type="password" class="form-input" [(ngModel)]="sharePassword" placeholder="Share password" aria-label="Share password" [disabled]="!form.share" />
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn--outline" (click)="goBack()">Cancel</button>
            @if (!isNew()) {
              <button class="btn btn--danger" (click)="remove()">Delete clip</button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./clip-editor.component.scss'],
})
export class ClipEditorComponent {
  readonly clipService = inject(ClipService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  readonly EXPIRY_PRESETS = EXPIRY_PRESETS;

  protected readonly form: Partial<Clip> & { share?: boolean; sharePassword?: string | null; shareOneTime?: boolean } = {
    title: '',
    content: '',
    contentType: 'text' as ContentType,
    language: 'text',
    tags: [],
    isPinned: false,
    isFavorite: false,
    expiresAt: null,
    share: false,
    shareOneTime: false,
    sharePassword: null,
  };

  protected tagsInput = '';
  protected readonly expiryPreset = signal<string | null>(null);
  protected readonly hasPassword = signal(false);
  protected readonly sharePassword = '';

  protected readonly isNew = signal(true);
  protected readonly editingId = signal<number | null>(null);

  protected readonly richHtml = computed(() => this.form.content || '');

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isNew.set(false);
      this.editingId.set(Number(id));
      void this.loadClip(Number(id));
    }
  }

  async loadClip(id: number): Promise<void> {
    const clip = await this.clipService.getClip(id);
    this.form.title = clip.title;
    this.form.content = clip.content;
    this.form.contentType = clip.contentType;
    this.form.language = clip.language;
    this.form.tags = clip.tags ?? [];
    this.form.isPinned = clip.isPinned;
    this.form.isFavorite = clip.isFavorite;
    this.form.expiresAt = clip.expiresAt;
    this.tagsInput = (clip.tags ?? []).join(', ');
    this.form.share = clip.shareEnabled;
    this.form.shareOneTime = clip.isOneTime;
    this.form.sharePassword = clip.shareToken ? '' : null; // placeholder
    this.hasPassword.set(!!clip.shareToken); // simplified
    if (clip.expiresAt) {
      this.expiryPreset.set('custom');
    }
  }

  setType(type: ContentType): void {
    this.form.contentType = type;
    if (!this.form.language) this.form.language = 'text';
  }

  onRichInput(event: Event): void {
    const target = event.target as HTMLElement;
    this.form.content = target.innerHTML;
  }

  onExpiryChange(): void {
    const p = this.expiryPreset();
    if (!p) { this.form.expiresAt = null; return; }
    const now = new Date();
    let ms = 0;
    switch (p) {
      case '1hour': ms = 60 * 60 * 1000; break;
      case '1day': ms = 24 * 60 * 60 * 1000; break;
      case '1week': ms = 7 * 24 * 60 * 60 * 1000; break;
      case '1month': ms = 30 * 24 * 60 * 60 * 1000; break;
    }
    this.form.expiresAt = ms ? new Date(now.getTime() + ms).toISOString() : null;
  }

  goBack(): void { this.router.navigate(['/app']); }

  async save(): Promise<void> {
    try {
      const tags = this.tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      this.form.tags = tags;
      const body = {
        title: this.form.title,
        content: this.form.content,
        contentType: this.form.contentType,
        language: this.form.language,
        tags: this.form.tags,
        isPinned: this.form.isPinned,
        isFavorite: this.form.isFavorite,
        expiresAt: this.form.expiresAt,
        share: this.form.share,
        sharePassword: this.hasPassword() ? this.sharePassword : null,
        shareOneTime: this.form.shareOneTime,
      };
      if (this.isNew()) {
        await this.clipService.createClip(body as any);
        this.toast.success('Clip created');
      } else {
        await this.clipService.updateClip(this.editingId()!, body as any);
        this.toast.success('Clip updated');
      }
      this.router.navigate(['/app']);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to save clip');
    }
  }

  async remove(): Promise<void> {
    if (!confirm('Delete this clip?')) return;
    try {
      await this.clipService.deleteClip(this.editingId()!);
      this.toast.success('Clip deleted');
      this.router.navigate(['/app']);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to delete clip');
    }
  }
}
