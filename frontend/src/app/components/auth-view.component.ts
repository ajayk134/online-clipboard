import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-auth-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span>Clipboard</span>
        </div>
        <h1 class="auth-title">{{ mode() === 'login' ? 'Welcome back' : 'Create account' }}</h1>
        <p class="auth-sub">{{ mode() === 'login' ? 'Sign in to your account' : 'Join us, it only takes a minute' }}</p>

        <form class="auth-form" (submit)="onSubmit($event)">
          @if (mode() === 'register') {
            <div class="form-group">
              <label class="form-label">Username</label>
              <input type="text" class="form-input" [(ngModel)]="reg.username" placeholder="Username" required aria-label="Username" />
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" class="form-input" [(ngModel)]="reg.email" placeholder="Email" required aria-label="Email" />
            </div>
          }
          <div class="form-group">
            <label class="form-label">{{ mode() === 'login' ? 'Username or email' : 'Username' }}</label>
            <input type="text" class="form-input" [(ngModel)]="credentials.identifier" placeholder="Username or email" required aria-label="Identifier" />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" class="form-input" [(ngModel)]="credentials.password" placeholder="Password" required aria-label="Password" />
          </div>
          <button class="btn btn--primary btn--full" type="submit">{{ mode() === 'login' ? 'Sign in' : 'Create account' }}</button>
        </form>

        <p class="auth-switch">
          {{ mode() === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button class="auth-switch-link" (click)="toggleMode()">{{ mode() === 'login' ? 'Sign up' : 'Sign in' }}</button>
        </p>
      </div>
      <div class="auth-footer">
        <small>Online Clipboard &copy; {{ year }}</small>
      </div>
    </div>
  `,
  styleUrls: ['./auth-view.component.scss'],
})
export class AuthViewComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly credentials = { identifier: '', password: '' };
  protected readonly reg = { username: '', email: '', password: '' };
  protected readonly year = new Date().getFullYear();

  toggleMode(): void { this.mode.set(this.mode() === 'login' ? 'register' : 'login'); }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.credentials.identifier, this.credentials.password);
      } else {
        await this.auth.register(this.reg.username, this.reg.email, this.reg.password || this.credentials.password);
      }
      await this.auth.me();
      this.router.navigateByUrl('/app');
    } catch (e: any) {
      this.toast.error(e?.message || 'Authentication failed');
    }
  }
}
