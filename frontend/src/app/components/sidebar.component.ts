import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClipService } from '../services/clip.service';
import { Clip } from '../models';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sidebar-panel" *ngIf="visible()">
      <div class="sidebar-header">
        <h2>Clipboard</h2>
        <p class="sidebar-sub">Manage your clips</p>
      </div>

      <div class="sidebar-section">
        <h3 class="section-title">Tags</h3>
        <div class="tag-list">
          @for (t of clipService.tags(); track t.tag) {
            <button class="tag-pill" (click)="filterByTag(t.tag)" [class.active]="activeTag() === t.tag">
              {{ t.tag }} <span class="tag-count">{{ t.count }}</span>
            </button>
          }
          @if (clipService.tags().length === 0) {
            <p class="empty">No tags yet</p>
          }
        </div>
      </div>

      <div class="sidebar-section">
        <h3 class="section-title">Stats</h3>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-value">{{ stats()?.total ?? 0 }}</div><div class="stat-label">Total</div></div>
          <div class="stat-card"><div class="stat-value">{{ stats()?.favorites ?? 0 }}</div><div class="stat-label">Favorites</div></div>
          <div class="stat-card"><div class="stat-value">{{ stats()?.pinned ?? 0 }}</div><div class="stat-label">Pinned</div></div>
          <div class="stat-card"><div class="stat-value">{{ stats()?.views ?? 0 }}</div><div class="stat-label">Views</div></div>
        </div>
      </div>

      <div class="sidebar-section">
        <h3 class="section-title">Import / Export</h3>
        <div class="action-group">
          <button class="btn btn--outline btn--full" (click)="exportAll()">Export all</button>
          <button class="btn btn--outline btn--full" (click)="openImport()">Import</button>
          <input type="file" #importFile accept=".json" (change)="onImportFile($event)" class="sr-only" />
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  readonly clipService = inject(ClipService);

  protected readonly visible = signal(false);
  protected readonly activeTag = signal<string | null>(null);

  protected readonly stats = this.clipService.stats;

  constructor() {
    effect(() => {
      // refresh tags/stats when clips load
      if (this.clipService.clips().length > 0) {
        void this.clipService.getTags();
        void this.clipService.getStats();
      }
    });
  }

  setVisible(v: boolean): void { this.visible.set(v); }

  filterByTag(tag: string): void {
    this.activeTag.set(this.activeTag() === tag ? null : tag);
  }

  exportAll(): void {
    void this.clipService.exportAll().then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clips-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  openImport(): void {
    const input = document.querySelector('#importFile') as HTMLInputElement | null;
    input?.click();
  }

  onImportFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        const items = data.items ?? data;
        await this.clipService.importClips(items);
      } catch (e) {
        console.error('Import failed', e);
      }
    };
    reader.readAsText(file);
  }
}
