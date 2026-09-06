import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, input, output, viewChild } from '@angular/core';

/**
 * The one search box in the app.
 *
 * Every list screen searches server-side, so this debounces: a judge typing
 * "Acme" fires one request, not four. The clear button resets in a single click
 * because a stale filter over an empty table is the most confusing state a list
 * screen can be left in.
 */
@Component({
  selector: 'df-search-box',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative" [style.width]="width()">
      <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400" aria-hidden="true">⌕</span>
      <input
        #box
        type="search"
        class="df-input !pl-8 [&::-webkit-search-cancel-button]:appearance-none"
        style="-moz-appearance: textfield;"
        [class.!pr-8]="value()"
        [value]="value()"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        (input)="onInput($event)"
        (keydown.escape)="clear()"
      />
      @if (value()) {
        <button
          type="button"
          class="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 transition hover:text-slate-700"
          aria-label="Clear search"
          (click)="clear()"
        >
          ✕
        </button>
      }
    </div>
  `,
})
export class SearchBoxComponent implements OnDestroy {
  readonly value = input('');
  readonly placeholder = input('Search…');
  readonly width = input('16rem');
  /** Milliseconds of quiet before the term is emitted. */
  readonly debounceMs = input(250);
  readonly search = output<string>();

  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  private timer: ReturnType<typeof setTimeout> | null = null;

  onInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search.emit(term.trim()), this.debounceMs());
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    const el = this.box()?.nativeElement;
    if (el) el.value = '';
    this.search.emit('');
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
