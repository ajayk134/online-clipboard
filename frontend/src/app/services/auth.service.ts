import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import {
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  PasswordChangeRequest,
  User,
} from '../models';

const TOKEN_KEY = 'oc_token';
const USER_KEY = 'oc_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly token = signal<string | null>(null);
  private readonly user = signal<User | null>(null);

  readonly isLoggedIn = signal(false);

  constructor() {
    this.restoreSession();
  }

  private restoreSession(): void {
    const t = localStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY);
    if (t && u) {
      try {
        this.token.set(t);
        this.user.set(JSON.parse(u) as User);
        this.isLoggedIn.set(true);
      } catch {
        this.clearSession();
      }
    }
  }

  setSession(token: string, user: User): void {
    this.token.set(token);
    this.user.set(user);
    this.isLoggedIn.set(true);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private clearSession(): void {
    this.token.set(null);
    this.user.set(null);
    this.isLoggedIn.set(false);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  readonly getToken = (): string | null => this.token();

  readonly getUser = (): User | null => this.user();

  login(identifier: string, password: string): Promise<AuthTokens> {
    return this.api
      .post<AuthTokens>('/auth/login', { identifier, password } as LoginRequest)
      .then((res) => {
        this.setSession(res.token, res.user);
        return res;
      });
  }

  register(
    username: string,
    email: string,
    password: string
  ): Promise<AuthTokens> {
    return this.api
      .post<AuthTokens>('/auth/register', {
        username,
        email,
        password,
      } as RegisterRequest)
      .then((res) => {
        this.setSession(res.token, res.user);
        return res;
      });
  }

  me(): Promise<User> {
    return this.api.get<User>('/auth/me').then((u) => {
      this.user.set(u);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      return u;
    });
  }

  logout(): Promise<void> {
    // Clear the client session first so the UI reflects logout immediately,
    // regardless of whether the server-side revocation call succeeds.
    this.clearSession();
    return this.api
      .post<{ message: string }>('/auth/logout')
      .then(() => {})
      .catch(() => {})
      .finally(() => {
        this.router.navigateByUrl('/login');
      });
  }

  changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ token: string; message: string }> {
    return this.api
      .put<{ token: string; message: string }>('/auth/password', {
        currentPassword,
        newPassword,
      } as PasswordChangeRequest)
      .then((res) => {
        if (res.token) {
          const user = this.user();
          if (user) {
            this.setSession(res.token, user);
          }
        }
        return res;
      });
  }
}
