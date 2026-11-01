import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ClickOutsideDirective } from '../directives/click-outside.directive';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule, ClickOutsideDirective],
  template: `
    <header class="topbar">
      <button class="topbar-menu" (click)="menuToggle.emit()" aria-label="Open navigation">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      <div class="topbar-search" (appClickOutside)="closeSearch()" [class.open]="searchOpen()">
        <input type="search" class="search-input" placeholder="Search clips…" [(ngModel)]="searchQuery" (input)="onSearch()" aria-label="Search clips" />
        <button class="search-clear" *ngIf="searchQuery" (click)="clearSearch()" aria-label="Clear">×</button>
      </div>

      <div class="topbar-spacer"></div>

      <button class="topbar-icon" (click)="themeToggle.emit()" aria-label="Toggle theme" [attr.aria-pressed]="themePressed()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79"></path>
        </svg>
      </button>

      <div class="topbar-user" appClickOutside (appClickOutside)="closeUserMenu()" [class.open]="userMenuOpen()">
        <button class="topbar-user-trigger" (click)="userMenuOpen.update(v => !v)" aria-label="User menu" aria-haspopup="true" [attr.aria-expanded]="userMenuOpen()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.47"></path>
          </svg>
        </button>
        <div class="user-menu" [class.open]="userMenuOpen()">
          <a class="menu-item" routerLink="/app" (click)="closeUserMenu()">My clips</a>
          <button class="menu-item" (click)="settings.emit()" (click)="closeUserMenu()">Settings</button>
          <button class="menu-item menu-item--danger" (click)="logout.emit()" (click)="closeUserMenu()">Sign out</button>
        </div>
      </div>
    </header>
  `,
  styleUrls: ['./topbar.component.scss'],
})
export class TopbarComponent {
  readonly menuToggle = output<void>();
  readonly themeToggle = output<void>();
  readonly settings = output<void>();
  readonly logout = output<void>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly searchOpen = signal(false);
  protected readonly userMenuOpen = signal(false);
  protected readonly themePressed = signal(false);
  protected searchQuery = '';

  constructor() {
    const saved = localStorage.getItem('oc_theme');
    if (saved === 'dark') this.themePressed.set(true);
    else if (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches) this.themePressed.set(true);
  }

  closeSearch(): void { this.searchOpen.set(false); }

  closeUserMenu(): void { this.userMenuOpen.set(false); }

  onSearch(): void {
    if (!this.searchQuery) {
      this.router.navigate(['/app']);
      return;
    }
    this.router.navigate(['/app'], { queryParams: { q: this.searchQuery } });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.router.navigate(['/app']);
  }
}
