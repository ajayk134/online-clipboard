import { Component, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClipService } from '../services/clip.service';
import { ClipCardComponent } from './clip-card.component';
import { Clip, ContentType } from '../models';

@Component({
  selector: 'app-clip-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ClipCardComponent],
  template: `
    <div class="clip-list">
      <div class="clip-header">
        <div class="clip-header-left">
          <h1>Clips</h1>
          <p class="clip-sub">{{ filteredCount() }} of {{ clipService.total() }} clips</p>
        </div>
        <div class="clip-header-right">
          <button class="btn btn--primary" (click)="openEditor()">New clip</button>
        </div>
      </div>

      <div class="clip-toolbar">
        <div class="toolbar-group">
          <label class="toolbar-label">Sort</label>
          <select class="toolbar-select" [(ngModel)]="sort" (change)="load()">
            <option value="updated_desc">Updated (newest)</option>
            <option value="updated_asc">Updated (oldest)</option>
            <option value="created_desc">Created (newest)</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </div>
        <div class="toolbar-group toolbar-group--divided">
          <label class="toolbar-label">Type</label>
          <select class="toolbar-select" [(ngModel)]="typeFilter" (change)="load()">
            <option value="">All types</option>
            <option value="text">Text</option>
            <option value="richtext">Rich text</option>
            <option value="code">Code</option>
          </select>
        </div>
        <div class="toolbar-group toolbar-group--divided">
          <label class="toolbar-label">Show</label>
          <select class="toolbar-select" [(ngModel)]="showFilter" (change)="load()">
            <option value="all">All</option>
            <option value="favorite">Favorites</option>
            <option value="pinned">Pinned</option>
          </select>
        </div>
      </div>

      <div class="clip-grid">
        @for (clip of visibleClips(); track clip.id) {
          <app-clip-card [clip]="clip" (copy)="onCopy($event)" (toggleFavorite)="onToggleFavorite($event)" (delete)="onDelete($event)" (edit)="openEditor($event)"></app-clip-card>
        }
        @if (visibleClips().length === 0) {
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h3>No clips found</h3>
            <p>Create your first clip to get started.</p>
            <button class="btn btn--primary" (click)="openEditor()">Create clip</button>
          </div>
        }
      </div>

      <div class="clip-pagination" *ngIf="clipService.total() > pageSize">
        <button class="btn btn--outline" [disabled]="page() === 1" (click)="prevPage()">Previous</button>
        <span class="page-info">Page {{ page() }} of {{ totalPages() }}</span>
        <button class="btn btn--outline" [disabled]="page() >= totalPages()" (click)="nextPage()">Next</button>
      </div>
    </div>
  `,
  styleUrls: ['./clip-list.component.scss'],
})
export class ClipListComponent {
  readonly clipService = inject(ClipService);
  private readonly router = inject(Router);

  protected readonly pageSize = 20;
  protected readonly page = signal(1);
  protected readonly sort = signal('updated_desc');
  protected readonly typeFilter = signal<ContentType | ''>('');
  protected readonly showFilter = signal<'all' | 'favorite' | 'pinned'>('all');
  protected readonly searchQ = signal('');

  protected readonly filteredCount = computed(() => this.clipService.clips().length);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.clipService.total() / this.pageSize)));

  protected readonly visibleClips = computed(() => {
    const items = this.clipService.clips();
    const q = this.searchQ().toLowerCase();
    const type = this.typeFilter();
    const show = this.showFilter();
    return items.filter((c) => {
      const matchQ = !q || c.title.toLowerCase().includes(q) || c.content.toLowerCase().includes(q);
      const matchType = !type || c.contentType === type;
      let matchShow = true;
      if (show === 'favorite') matchShow = c.isFavorite;
      if (show === 'pinned') matchShow = c.isPinned;
      return matchQ && matchType && matchShow;
    });
  });

  constructor() {
    effect(() => {
      void this.load();
    });
    // reload tags/stats
    void this.clipService.getTags();
    void this.clipService.getStats();
  }

  async load(): Promise<void> {
    const offset = (this.page() - 1) * this.pageSize;
    await this.clipService.getClips({
      q: this.searchQ() || undefined,
      tag: undefined,
      favorite: this.showFilter() === 'favorite' ? true : undefined,
      pinned: this.showFilter() === 'pinned' ? true : undefined,
      type: this.typeFilter() || undefined,
      sort: this.sort(),
      limit: this.pageSize,
      offset,
    });
  }

  prevPage(): void { if (this.page() > 1) { this.page.update(p => p - 1); } }
  nextPage(): void { this.page.update(p => p + 1); }

  openEditor(clip?: Clip): void {
    this.router.navigate(['/app/editor', clip?.id ?? 'new']);
  }

  async onCopy(id: number): Promise<void> {
    await this.clipService.copyClip(id);
    await this.load();
  }

  async onToggleFavorite(id: number): Promise<void> {
    const clip = this.clipService.clips().find((c) => c.id === id);
    if (!clip) return;
    await this.clipService.toggleFlags(id, { isFavorite: !clip.isFavorite });
    await this.load();
  }

  async onDelete(id: number): Promise<void> {
    if (!confirm('Delete this clip?')) return;
    await this.clipService.deleteClip(id);
    await this.load();
  }
}
