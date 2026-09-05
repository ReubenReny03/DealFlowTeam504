import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  title: string;
  body?: string;
}

/** Global notification surface. The HTTP interceptor pushes errors here. */
@Injectable({ providedIn: 'root' })
export class ToastStore {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  push(kind: Toast['kind'], title: string, body?: string, ttlMs = 6000): void {
    const toast: Toast = { id: this.nextId++, kind, title, body };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), ttlMs);
  }

  success(title: string, body?: string): void { this.push('success', title, body); }
  error(title: string, body?: string): void { this.push('error', title, body, 9000); }
  info(title: string, body?: string): void { this.push('info', title, body); }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
