import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { TimeAgoPipe } from '../pipes/time-ago.pipe';
import { ClipService } from '../services/clip.service';
import { Clip } from '../models';

@Component({
  selector: 'app-clip-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TimeAgoPipe],
  template: `
    <article class="clip-card" [class.favorite]="clip().isFavorite" [class.pinned]="clip().isPinned" [routerLink]="'/app/detail/' + clip().id" (click)="openDetail()">
      <div class="card-header">
        <div class="card-actions">
          <button class="icon-btn" (click)="onCopy($event)" [attr.aria-label]="'Copy ' + clip().title" title="Copy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="icon-btn icon-btn--fav" (click)="onToggleFavorite($event)" [attr.aria-label]="clip().isFavorite ? 'Unfavorite' : 'Favorite'" [class.active]="clip().isFavorite">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.49a5.48 5.48 0 0 0-7.38 0L2 12.57C2 13.67 3.45 15.56 5 16.92l1.3 1.04a2 2 0 0 0 2.4 0l3.6-2.88 3.6 2.88a2 2 0 0 0 2.4 0l1.3-1.04c1.54-1.36 3-3.25 3-4.36z"></path>
            </svg>
          </button>
          <button class="icon-btn" (click)="edit.emit(clip())" [attr.aria-label]="'Edit ' + clip().title" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><polyline points="18.5 2.5 18.5 13.5 13.5 13.5"></polyline>
            </svg>
          </button>
          <button class="icon-btn" (click)="onDelete($event)" [attr.aria-label]="'Delete ' + clip().title" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div class="card-meta">
          <span class="card-type">{{ clip().contentType }}</span>
          @if (clip().isPinned) {
            <span class="card-badge card-badge--pin">Pinned</span>
          }
          @if (clip().shareEnabled) {
            <span class="card-badge card-badge--share">Shared</span>
          }
          @if (clip().isOneTime) {
            <span class="card-badge card-badge--onetime">One-time</span>
          }
        </div>
      </div>
      <h2 class="card-title">{{ clip().title }}</h2>
      <div class="card-excerpt">{{ clip().excerpt }}</div>
      <div class="card-footer">
        <div class="card-tags">
          @for (tag of clip().tags; track tag) {
            <span class="tag">{{ tag }}</span>
          }
        </div>
        <div class="card-stats">
          <span class="stat" title="Copies">{{ clip().copyCount }}</span>
          <span class="stat" title="Views">{{ clip().viewCount }}</span>
          <span class="stat" title="Updated">{{ clip().updatedAt | timeAgo }}</span>
        </div>
      </div>
    </article>
  `,
  styleUrls: ['./clip-card.component.scss'],
})
export class ClipCardComponent {
  readonly clip = input.required<Clip>();
  readonly copy = output<number>();
  readonly toggleFavorite = output<number>();
  readonly delete = output<number>();
  readonly edit = output<Clip>();

  private readonly router = inject(Router);
  private readonly clipService = inject(ClipService);

  openDetail(): void {
    this.router.navigate(['/app/detail', this.clip().id]);
  }

  onCopy(event: Event): void {
    event.stopPropagation();
    this.copy.emit(this.clip().id);
  }

  onToggleFavorite(event: Event): void {
    event.stopPropagation();
    this.toggleFavorite.emit(this.clip().id);
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.delete.emit(this.clip().id);
  }
}
