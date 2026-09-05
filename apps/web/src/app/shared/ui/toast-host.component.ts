import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastStore } from '../../core/state/toast.store';

@Component({
  selector: 'df-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      @for (toast of store.toasts(); track toast.id) {
        <div class="pointer-events-auto df-card border-l-4 p-3.5 shadow-lg" [class]="border(toast.kind)" role="status">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-800">{{ toast.title }}</p>
              @if (toast.body) { <p class="mt-0.5 text-sm leading-snug text-slate-600">{{ toast.body }}</p> }
            </div>
            <button type="button" class="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="Dismiss" (click)="store.dismiss(toast.id)">✕</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly store = inject(ToastStore);
  border(kind: string): string {
    return kind === 'error' ? 'border-l-rose-500' : kind === 'success' ? 'border-l-emerald-500' : 'border-l-brand-500';
  }
}
