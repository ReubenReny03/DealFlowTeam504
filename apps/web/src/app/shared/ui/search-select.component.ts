import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, forwardRef, inject,
  input, output, signal, viewChild,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

/** One page of results, as handed back by a `df-search-select` fetcher. */
export interface SearchSelectPage<T> {
  items: T[];
  total: number;
}

/** Fetches one page of options for a given (server-side) search term. */
export type SearchSelectFetcher<T> = (q: string, page: number, pageSize: number) => Promise<SearchSelectPage<T>>;

/**
 * A search-and-lazy-list combobox — the drop-in replacement for a plain
 * `<select>` wherever the option list is too large to hand the browser in
 * one response (customers, products, users…).
 *
 * The caller only supplies a `fetchPage` (server-side search + pagination)
 * and a `displayWith` (how to label one item). This component owns the rest:
 *  - opens into a small popover with its own filter input,
 *  - shows the first page immediately instead of every option at once,
 *  - fetches the next page itself once the list is scrolled near its end
 *    (infinite scroll — a 5,000-row table never lands in one DOM),
 *  - re-queries from page 1, 250ms after the user stops typing, and
 *  - drops any response that is no longer the latest request, so a slow
 *    page-1 fetch can never clobber a faster page-2 (or a newer search).
 *
 * Implements `ControlValueAccessor`, so it drops into `[(ngModel)]` /
 * reactive forms exactly like the `<select>` it replaces.
 */
@Component({
  selector: 'df-search-select',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchSelectComponent), multi: true },
  ],
  template: `
    <div class="relative" [style.width]="width()">
      <button
        type="button"
        class="df-input flex items-center justify-between gap-2 text-left"
        [class.text-slate-400]="!selectedLabel()"
        [disabled]="isDisabled()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        (click)="toggle()"
        (keydown.ArrowDown)="onTriggerArrowDown($event)"
      >
        <span class="truncate">{{ selectedLabel() || placeholder() }}</span>
        <span class="flex shrink-0 items-center gap-1">
          @if (selectedLabel() && !isDisabled()) {
            <span
              role="button"
              aria-label="Clear selection"
              class="rounded px-1 text-slate-400 hover:text-slate-700"
              (click)="clear($event)"
            >✕</span>
          }
          <span class="text-slate-400" aria-hidden="true">{{ open() ? '▲' : '▼' }}</span>
        </span>
      </button>

      @if (open()) {
        <!--
          This popover usually sits inside a "<label>" (every "df-label" field
          in the app wraps its control that way). A native <label> re-fires a
          synthetic click on its first labelable descendant — our trigger
          button — for ANY click that reaches it and isn't marked
          defaultPrevented; stopPropagation alone does not stop that (Chromium
          dispatches it as a separate event, not as continued propagation of
          this one). Left unguarded, picking an option reopens the panel right
          after pick() closes it, and clicking blank panel space toggles it
          shut. preventDefault is what the label actually honours.
        -->
        <div
          class="df-card df-scale-in absolute z-20 mt-1 w-full origin-top overflow-hidden p-0 shadow-lg"
          (click)="$event.preventDefault()"
        >
          <div class="border-b border-slate-100 p-2">
            <input
              #searchInput
              type="text"
              class="df-input"
              [placeholder]="searchPlaceholder()"
              [attr.aria-label]="searchPlaceholder()"
              [value]="term()"
              (input)="onTermInput($event)"
              (keydown)="onSearchKeydown($event)"
            />
          </div>
          <ul #panel role="listbox" class="df-scroll-y max-h-64 overflow-y-auto py-1" (scroll)="onScroll($event)">
            @if (loading()) {
              <li class="px-3 py-4 text-center text-sm text-slate-400">Loading…</li>
            } @else if (items().length === 0) {
              <li class="px-3 py-4 text-center text-sm text-slate-400">{{ emptyText() }}</li>
            } @else {
              @for (item of items(); track idOf()(item); let i = $index) {
                <li
                  role="option"
                  [attr.data-index]="i"
                  [attr.aria-selected]="idOf()(item) === value()"
                  class="cursor-pointer px-3 py-2 text-sm text-slate-700"
                  [class.bg-brand-50]="i === activeIndex()"
                  [class.font-medium]="idOf()(item) === value()"
                  (mouseenter)="activeIndex.set(i)"
                  (click)="pick(item)"
                >
                  {{ displayWith()(item) }}
                  @if (idOf()(item) === value()) { <span class="float-right text-brand-600">✓</span> }
                </li>
              }
              @if (loadingMore()) {
                <li class="px-3 py-2 text-center text-xs text-slate-400">Loading more…</li>
              } @else if (hasMore()) {
                <li class="px-3 py-1.5 text-center text-xs text-slate-400">{{ items().length }} of {{ total() }} — scroll for more</li>
              }
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class SearchSelectComponent<T> implements ControlValueAccessor, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly fetchPage = input.required<SearchSelectFetcher<T>>();
  readonly displayWith = input.required<(item: T) => string>();
  readonly idOf = input<(item: T) => string>((item: any) => item.id);
  readonly placeholder = input('Select…');
  readonly searchPlaceholder = input('Type to search…');
  readonly emptyText = input('No matches');
  readonly pageSize = input(20);
  readonly debounceMs = input(250);
  readonly width = input('100%');
  readonly disabled = input(false);
  /** Label to show for a value written in from outside (e.g. an existing record being edited) before its item has ever been fetched. */
  readonly initialLabel = input<string | null>(null);

  /** Fires with the full picked object — `[(ngModel)]` only carries the id. */
  readonly picked = output<T | null>();

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly panelRef = viewChild<ElementRef<HTMLUListElement>>('panel');

  protected readonly open = signal(false);
  protected readonly term = signal('');
  protected readonly items = signal<T[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly activeIndex = signal(-1);

  protected readonly value = signal<string | null>(null);
  protected readonly selectedLabel = signal('');
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly hasMore = computed(() => this.items().length < this.total());

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Guards against an in-flight request resolving after a newer one already has. */
  private requestSeq = 0;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  toggle(): void {
    if (this.isDisabled()) return;
    this.open() ? this.close() : this.openPanel();
  }

  onTriggerArrowDown(event: Event): void {
    if (this.isDisabled() || this.open()) return;
    event.preventDefault();
    this.openPanel();
  }

  private openPanel(): void {
    this.open.set(true);
    this.term.set('');
    this.activeIndex.set(-1);
    void this.runQuery(1);
    setTimeout(() => this.searchInputRef()?.nativeElement.focus());
  }

  private close(): void {
    this.open.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  onTermInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.term.set(next);
    this.activeIndex.set(-1);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.runQuery(1), this.debounceMs());
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 64;
    if (nearBottom && this.hasMore() && !this.loading() && !this.loadingMore()) {
      void this.runQuery(this.page() + 1);
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.items()[this.activeIndex()];
        if (item) this.pick(item);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  private moveActive(delta: number): void {
    const count = this.items().length;
    if (!count) return;
    const next = Math.min(Math.max(this.activeIndex() + delta, 0), count - 1);
    this.activeIndex.set(next);
    queueMicrotask(() => {
      this.panelRef()?.nativeElement.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  pick(item: T): void {
    const id = this.idOf()(item);
    this.value.set(id);
    this.selectedLabel.set(this.displayWith()(item));
    this.onChange(id);
    this.onTouched();
    this.picked.emit(item);
    this.close();
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.value.set(null);
    this.selectedLabel.set('');
    this.onChange(null);
    this.onTouched();
    this.picked.emit(null);
  }

  private async runQuery(page: number): Promise<void> {
    const seq = ++this.requestSeq;
    const isFirstPage = page === 1;
    isFirstPage ? this.loading.set(true) : this.loadingMore.set(true);
    try {
      const result = await this.fetchPage()(this.term(), page, this.pageSize());
      if (seq !== this.requestSeq) return; // superseded by a newer search or page request
      this.items.set(isFirstPage ? result.items : [...this.items(), ...result.items]);
      this.total.set(result.total);
      this.page.set(page);
    } catch {
      if (seq !== this.requestSeq) return;
      if (isFirstPage) { this.items.set([]); this.total.set(0); }
    } finally {
      if (seq === this.requestSeq) { this.loading.set(false); this.loadingMore.set(false); }
    }
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
    if (!value) this.selectedLabel.set('');
    else if (!this.selectedLabel()) this.selectedLabel.set(this.initialLabel() ?? '');
  }
  registerOnChange(fn: (value: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.formDisabled.set(isDisabled); }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
