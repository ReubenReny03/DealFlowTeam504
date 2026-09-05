import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Every list screen renders this instead of a blank page.
 * The copy comes from EMPTY_STATES in @dealflow/shared, so the words on screen
 * and the words in docs/USER_FLOWS.md §B are literally the same strings.
 */
@Component({
  selector: 'df-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div class="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-lg">{{ icon() }}</div>
      <h3 class="text-base font-semibold text-slate-800">{{ title() }}</h3>
      <p class="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{{ body() }}</p>
      @if (cta()) {
        <button type="button" class="df-btn-primary mt-5" (click)="action.emit()">{{ cta() }}</button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly cta = input<string | null>(null);
  readonly icon = input('📭');
  readonly action = output<void>();
}
