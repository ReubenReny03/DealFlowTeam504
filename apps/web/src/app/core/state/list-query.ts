import { computed, signal } from '@angular/core';
import type { ApiMeta } from '@dealflow/shared';

/**
 * The search-and-pagination state every list screen shares.
 *
 * Searching and paging are server-side throughout — the full seeded quotation
 * set must never arrive in one response — so the same three parameters (`q`, `page`,
 * `pageSize`) travel on every list request. This holds them, keeps `total` in
 * step with the response `meta`, and enforces the one rule that is easy to get
 * wrong by hand: a new search term always resets to page 1, or the user lands
 * on page 4 of a two-page result and sees nothing.
 */
export class ListQuery {
  readonly q = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  /** True when a search term is narrowing the list — drives the "no matches" copy. */
  readonly isFiltered = computed(() => this.q().length > 0);

  constructor(pageSize = 25) {
    this.pageSize.set(pageSize);
  }

  /** Query params for the request. Empty values are dropped by `ApiService`. */
  params(extra: Record<string, string | number | boolean | undefined | null> = {}) {
    return { q: this.q() || undefined, page: this.page(), pageSize: this.pageSize(), ...extra };
  }

  /** A new term always restarts at page 1. Returns false when nothing changed. */
  setSearch(term: string): boolean {
    const next = term.trim();
    if (next === this.q()) return false;
    this.q.set(next);
    this.page.set(1);
    return true;
  }

  /** Clamped, so a stale "Next" click can never strand the user past the end. */
  goToPage(page: number): boolean {
    const next = Math.min(Math.max(1, page), this.totalPages());
    if (next === this.page()) return false;
    this.page.set(next);
    return true;
  }

  applyMeta(meta: ApiMeta | undefined, fallbackCount: number): void {
    this.total.set(meta?.total ?? fallbackCount);
    // A delete (or a narrowing search racing a page click) can leave us past the
    // last page; step back rather than render an empty table with rows behind it.
    if (this.page() > this.totalPages()) this.page.set(this.totalPages());
  }

  reset(): void {
    this.q.set('');
    this.page.set(1);
    this.total.set(0);
  }
}
