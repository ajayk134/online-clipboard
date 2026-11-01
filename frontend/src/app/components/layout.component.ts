import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastComponent } from './toast.component';
import { TopbarComponent } from './topbar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, ToastComponent, TopbarComponent],
  template: `
    <div class="layout">
      <aside class="sidebar" [class.open]="sidebarOpen()">
        <div class="sidebar-backdrop" (click)="toggleSidebar()"></div>
        <div class="sidebar-content">
          <div class="sidebar-brand">
            <span [innerHTML]="iconClipboard"></span>
          </div>
          <span class="sidebar-brand-text">Clipboard</span>
          <nav class="sidebar-nav">
            <a routerLink="/app/clips" routerLinkActive="active" (click)="closeSidebar()">
              <span class="nav-icon" [innerHTML]="iconClip"></span><span>Clips</span>
            </a>
            <a routerLink="/app/tags" routerLinkActive="active" (click)="closeSidebar()">
              <span class="nav-icon" [innerHTML]="iconTag"></span><span>Tags</span>
            </a>
            <a routerLink="/app/stats" routerLinkActive="active" (click)="closeSidebar()">
              <span class="nav-icon" [innerHTML]="iconStats"></span><span>Stats</span>
            </a>
          </nav>
          <div class="sidebar-divider"></div>
          <nav class="sidebar-nav sidebar-nav-bottom">
            <button class="nav-item" (click)="openSettings()">
              <span class="nav-icon" [innerHTML]="iconSettings"></span><span>Settings</span>
            </button>
            <button class="nav-item nav-item--danger" (click)="logout()">
              <span class="nav-icon" [innerHTML]="iconSignOut"></span><span>Sign out</span>
            </button>
          </nav>
          <div class="sidebar-user" *ngIf="auth.getUser()">
            <div class="sidebar-user-avatar">{{ auth.getUser()!.username.charAt(0).toUpperCase() }}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">{{ auth.getUser()!.username }}</div>
              <div class="sidebar-user-email">{{ auth.getUser()!.email }}</div>
            </div>
          </div>
        </div>
      </aside>

      <div class="layout-body">
        <app-topbar (menuToggle)="toggleSidebar()" (themeToggle)="toggleTheme()"></app-topbar>
        <main class="layout-content">
          <router-outlet></router-outlet>
        </main>
      </div>

      <app-toast></app-toast>
    </div>
  `,
  styleUrls: ['./layout.component.scss'],
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  protected readonly sidebarOpen = signal(false);

  readonly iconClipboard = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
  readonly iconClip = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  readonly iconTag = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-8 8M16 21l-8-8M20.59 8.41l-8 8M8 3l8 8"></path></svg>`;
  readonly iconStats = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11.13" y2="12.87"></line><line x1="22" y1="22" x2="11.13" y2="12.87"></line><line x1="2" y1="22" x2="12.87" y2="11.13"></line><line x1="2" y1="2" x2="12.87" y2="11.13"></line></svg>`;
  readonly iconSettings = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2v0a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2v0a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2v0a2 2 0 0 1 2-2v-0.9"></path></svg>`;
  readonly iconSignOut = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleTheme(): void {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('oc_theme', next);
  }

  openSettings(): void {
    this.closeSidebar();
  }

  logout(): void {
    this.closeSidebar();
    void this.auth.logout();
  }

  constructor() {
    effect(() => {
      const saved = localStorage.getItem('oc_theme');
      if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    });
  }
}
