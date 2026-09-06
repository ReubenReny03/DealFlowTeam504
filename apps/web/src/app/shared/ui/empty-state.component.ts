import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NO_MATCHES } from '@dealflow/shared';

/**
 * Every list screen renders this instead of a blank page.
 * The copy comes from EMPTY_STATES in @dealflow/shared, so the words on screen
 * and the words in docs/USER_FLOWS.md §B are literally the same strings.
 *
 * It knows about search, and that is the point: an empty collection and a search
 * that matched nothing are different facts, and every list screen would
 * otherwise have to remember to tell them apart. Pass `[filtered]` and the
 * component swaps to the NO_MATCHES copy and offers to clear the search.
 */
@Component({
  selector: 'df-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="df-fade-in flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div class="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-slate-50 to-slate-100 text-lg ring-1 ring-slate-200">{{ filtered() ? '🔍' : icon() }}</div>
      <h3 class="text-base font-semibold text-slate-800">{{ shownTitle() }}</h3>
      <p class="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{{ shownBody() }}</p>
      @if (filtered()) {
        <button type="button" class="df-btn-ghost mt-5" (click)="clearSearch.emit()">{{ noMatches.cta }}</button>
      } @else if (cta()) {
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
  /** True when a search term is what emptied the list, rather than the collection being empty. */
  readonly filtered = input(false);
  /** Echoed back to the user so they can see what they actually searched for. */
  readonly searchTerm = input('');
  readonly action = output<void>();
  readonly clearSearch = output<void>();

  protected readonly noMatches = NO_MATCHES;

  protected readonly shownTitle = computed(() =>
    this.filtered()
      ? this.searchTerm()
        ? `No matches for “${this.searchTerm()}”`
        : NO_MATCHES.title
      : this.title(),
  );
  protected readonly shownBody = computed(() => (this.filtered() ? NO_MATCHES.body : this.body()));
}
