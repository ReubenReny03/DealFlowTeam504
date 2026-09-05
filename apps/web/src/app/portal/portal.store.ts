import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  PortalCounterResponse,
  PortalQuotationListResponse,
  PortalQuotationSummaryDto,
  PortalResolveResponse,
} from '@dealflow/shared';
import { ApiService } from '../core/api/api.service';
import { ListQuery } from '../core/state/list-query';
import { SessionStore } from '../core/state/session.store';

/**
 * The portal's own state. Note it talks to /portal/* only — the customer surface
 * never touches an internal endpoint, which is what keeps the boundary real
 * rather than cosmetic.
 */
@Injectable({ providedIn: 'root' })
export class PortalStore {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly errorCode = signal<string | null>(null);
  readonly data = signal<PortalResolveResponse | null>(null);
  readonly submitting = signal(false);

  /* ---- the company's whole quotation list (one customer, many quotations) ---- */
  readonly listLoading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly list = signal<PortalQuotationSummaryDto[]>([]);
  readonly company = signal<PortalQuotationListResponse['customer'] | null>(null);
  /** True for a magic-link session: the link still unlocks exactly one quotation. */
  readonly scopedToSingle = signal(false);
  /** A customer's list pages too — a long-standing account has plenty of quotations. */
  readonly listQuery = new ListQuery(10);
  /**
   * True as soon as we know the company has more than one quotation — the
   * resolve response carries `siblingCount`, so the detail screen can offer the
   * way back without waiting on the list call.
   */
  readonly hasMultiple = computed(
    () =>
      this.listQuery.total() > 1 ||
      this.list().length > 1 ||
      (this.data()?.siblingCount ?? 0) > 1,
  );

  readonly quotation = computed(() => this.data()?.quotation ?? null);
  readonly events = computed(() => this.data()?.events ?? []);
  readonly canConfirm = computed(() => this.data()?.canConfirm ?? false);
  readonly negotiationNoticeText = computed(
    () =>
      this.data()?.negotiationNotice ??
      'If the final terms go beyond what your account manager can approve on their own, the quotation goes back for internal approval automatically.',
  );

  /**
   * The company's quotations, newest activity first. Safe to call repeatedly —
   * the list page, the detail page's switcher and `load()`'s fallback all share it.
   */
  async loadList(force = false): Promise<PortalQuotationSummaryDto[]> {
    if (!force && this.list().length > 0) return this.list();
    this.listLoading.set(true);
    this.listError.set(null);
    try {
      const { data, meta } = await firstValueFrom(
        this.api.getWithMeta<PortalQuotationListResponse>(
          '/portal/quotations',
          this.listQuery.params(),
        ),
      );
      this.list.set(data.items);
      this.company.set(data.customer);
      this.scopedToSingle.set(data.scopedToSingleQuotation);
      this.listQuery.applyMeta(meta, data.items.length);
      return data.items;
    } catch (err: any) {
      this.listError.set(
        err?.error?.error?.message ?? 'We could not load your quotations right now.',
      );
      return [];
    } finally {
      this.listLoading.set(false);
    }
  }

  searchList(term: string): void {
    if (this.listQuery.setSearch(term)) void this.loadList(true);
  }

  goToListPage(page: number): void {
    if (this.listQuery.goToPage(page)) void this.loadList(true);
  }

  async load(numberOrId?: string): Promise<void> {
    // No explicit target: prefer the quotation the session was handed, and fall
    // back to the company's most recent one rather than dead-ending.
    let target = numberOrId ?? this.session.portalQuotationId();
    if (!target) target = (await this.loadList())[0]?.number ?? null;
    if (!target) {
      this.error.set(
        this.listError() ?? 'You have no quotations to review yet. Your account manager will send one here.',
      );
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.errorCode.set(null);
    try {
      this.data.set(await firstValueFrom(this.api.get<PortalResolveResponse>(`/portal/q/${target}`)));
    } catch (err: any) {
      const apiError = err?.error?.error;
      this.errorCode.set(apiError?.code ?? null);
      this.error.set(apiError?.message ?? 'We could not open that quotation.');
    } finally {
      this.loading.set(false);
    }
  }

  /** A question, with no counter attached — never re-enters approval. */
  async comment(lineId: string | undefined, comment: string): Promise<void> {
    const number = this.quotation()?.number;
    if (!number) return;
    this.submitting.set(true);
    try {
      await firstValueFrom(this.api.post(`/portal/q/${number}/comment`, { lineId, comment }));
      await this.load(number);
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * On the server this recomputes the blended risk and, if the new terms breach
   * the thresholds, forces the quotation back to PENDING_APPROVAL with the audit
   * reason RE_ENTERED_FROM_NEGOTIATION. That is the demo's biggest moment.
   */
  async counter(body: unknown): Promise<PortalCounterResponse> {
    const number = this.quotation()!.number;
    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.api.post<PortalCounterResponse>(`/portal/q/${number}/counter`, body));
      await this.load(number);
      await this.loadList(true);
      return result;
    } finally {
      this.submitting.set(false);
    }
  }

  /** Confirms the quotation as-is, then triggers order creation and the warehouse split. */
  async confirm(): Promise<void> {
    const number = this.quotation()!.number;
    this.submitting.set(true);
    try {
      await firstValueFrom(this.api.post(`/portal/q/${number}/confirm`, {}));
      await this.load(number);
      await this.loadList(true);
    } finally {
      this.submitting.set(false);
    }
  }
}
