import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * The one paginator in the app. Rendered by a list screen only when the total
 * exceeds one page, so a short list stays clean.
 */
@Component({
  selector: 'df-paginator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (totalPages() > 1) {
      <nav class="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
        <p class="text-slate-500">Page {{ page() }} of {{ totalPages() }} · {{ total() }} total</p>
        <div class="flex gap-2">
          <button
            type="button"
            class="df-btn-ghost !px-3 !py-1.5 text-xs"
            [disabled]="page() <= 1"
            (click)="go.emit(page() - 1)"
          >
            ← Prev
          </button>
          <button
            type="button"
            class="df-btn-ghost !px-3 !py-1.5 text-xs"
            [disabled]="page() >= totalPages()"
            (click)="go.emit(page() + 1)"
          >
            Next →
          </button>
        </div>
      </nav>
    }
  `,
})
export class PaginatorComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly go = output<number>();
}
