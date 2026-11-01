import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);
  private counter = 0;

  readonly all = this.toasts.asReadonly();

  show(message: string, type: ToastType = 'info', duration = 4000): string {
    const id = `toast-${++this.counter}`;
    const toast: Toast = { id, type, message, duration };
    this.toasts.set([...this.toasts(), toast]);
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
    return id;
  }

  success(message: string, duration?: number): string {
    return this.show(message, 'success', duration);
  }

  error(message: string, duration?: number): string {
    return this.show(message, 'error', duration ?? 6000);
  }

  warning(message: string, duration?: number): string {
    return this.show(message, 'warning', duration);
  }

  info(message: string, duration?: number): string {
    return this.show(message, 'info', duration);
  }

  remove(id: string): void {
    this.toasts.set(this.toasts().filter((t) => t.id !== id));
  }

  clear(): void {
    this.toasts.set([]);
  }
}
