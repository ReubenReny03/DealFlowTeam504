/**
 * Feature stores, one per workstream slice.
 *
 * They all follow the same shape: `loading`, `error`, `data` signals plus a
 * `load()` that fills them. Components never call the ApiService directly —
 * that keeps loading and error states consistent on all 18 screens.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ApprovalChainConfigDto,
  ApprovalDto,
  ApprovalListDto,
  BillingDetailDto,
  DealHealthDashboardDto,
  FulfillmentDto,
  FulfillmentListDto,
  InvoiceDto,
  InvoiceListDto,
  NotificationDto,
  NotificationListDto,
  OrderDto,
  ReissuePortalLinkResponse,
  ReportingDashboardDto,
  SubscriptionListDto,
} from '@dealflow/shared';
import { ApiService } from './api-token';

/** Small helper so every store gets identical loading/error handling. */
function loader<T>(fn: () => Promise<T>) {
  const loading = signal(false);
  const error = signal<string | null>(null);
  const data = signal<T | null>(null);
  const run = async () => {
    loading.set(true);
    error.set(null);
    try {
      data.set(await fn());
    } catch (err: any) {
      error.set(err?.error?.error?.message ?? 'Could not load this screen.');
    } finally {
      loading.set(false);
    }
  };
  return { loading, error, data, run };
}

@Injectable({ providedIn: 'root' })
export class ApprovalStore {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly list = signal<ApprovalListDto | null>(null);
  readonly current = signal<ApprovalDto | null>(null);
  readonly pendingOnly = signal(false);

  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly total = signal(0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  readonly counts = computed(
    () => this.list()?.counts ?? { pending: 0, returned: 0, approved: 0, rejected: 0 },
  );
  readonly items = computed(() => this.list()?.items ?? []);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data, meta } = await firstValueFrom(
        this.api.getWithMeta<ApprovalListDto>('/approvals', {
          pendingOnly: this.pendingOnly() || undefined,
          page: this.page(),
          pageSize: this.pageSize(),
        }),
      );
      this.list.set(data);
      this.total.set(meta?.total ?? data.items.length);
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load the approval queue.');
    } finally {
      this.loading.set(false);
    }
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
    void this.load();
  }

  /** `POST /quotations/:id/portal-link` — reissue the customer's magic link. */
  async reissuePortalLink(
    quotationId: string,
    reason?: string,
  ): Promise<ReissuePortalLinkResponse> {
    return firstValueFrom(
      this.api.post<ReissuePortalLinkResponse>(`/quotations/${quotationId}/portal-link`, {
        reason,
      }),
    );
  }

  async loadOne(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.current.set(await firstValueFrom(this.api.get<ApprovalDto>(`/approvals/${id}`)));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load this approval.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * `POST /approvals/:id/{approve,return,reject}`.
   * Each sends a reason and refreshes `current()` from the response.
   */
  async decide(
    id: string,
    action: 'approve' | 'return' | 'reject',
    reason: string,
  ): Promise<ApprovalDto> {
    const updated = await firstValueFrom(
      this.api.post<ApprovalDto>(`/approvals/${id}/${action}`, { reason }),
    );
    this.current.set(updated);
    await this.load();
    return updated;
  }
}

@Injectable({ providedIn: 'root' })
export class FulfillmentStore {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly overview = signal<FulfillmentListDto | null>(null);
  readonly current = signal<FulfillmentDto | null>(null);

  readonly stock = computed(() => this.overview()?.stock ?? []);
  readonly awaiting = computed(() => this.overview()?.awaiting ?? []);
  /** Drives screen 8's "Consolidate Remaining Backorder" banner. */
  readonly consolidationAvailable = computed(() => !!this.current()?.consolidationAvailableAt);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.overview.set(await firstValueFrom(this.api.get<FulfillmentListDto>('/fulfillment')));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load fulfillment.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadOne(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.current.set(await firstValueFrom(this.api.get<FulfillmentDto>(`/fulfillment/${id}`)));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load this fulfillment.');
    } finally {
      this.loading.set(false);
    }
  }

  async acceptSplit(id: string): Promise<void> {
    await firstValueFrom(this.api.post(`/fulfillment/${id}/accept`, {}));
    await this.loadOne(id);
  }
  async overrideSplit(id: string, allocations: unknown, reason: string): Promise<void> {
    await firstValueFrom(this.api.post(`/fulfillment/${id}/override`, { allocations, reason }));
    await this.loadOne(id);
  }
  async consolidate(id: string): Promise<void> {
    await firstValueFrom(this.api.post(`/fulfillment/${id}/consolidate`, {}));
    await this.loadOne(id);
  }
}

@Injectable({ providedIn: 'root' })
export class BillingStore {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly subscriptions = signal<SubscriptionListDto | null>(null);
  readonly invoices = signal<InvoiceListDto | null>(null);
  readonly detail = signal<BillingDetailDto | null>(null);
  readonly invoice = signal<{
    invoice: InvoiceDto;
    order: OrderDto | null;
    relatedInvoices: InvoiceDto[];
  } | null>(null);

  readonly pageSize = signal(50);
  readonly subscriptionsPage = signal(1);
  readonly subscriptionsTotal = signal(0);
  readonly invoicesPage = signal(1);
  readonly invoicesTotal = signal(0);
  readonly subscriptionsTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.subscriptionsTotal() / this.pageSize())),
  );
  readonly invoicesTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.invoicesTotal() / this.pageSize())),
  );

  async loadSubscriptions(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data, meta } = await firstValueFrom(
        this.api.getWithMeta<SubscriptionListDto>('/subscriptions', {
          page: this.subscriptionsPage(),
          pageSize: this.pageSize(),
        }),
      );
      this.subscriptions.set(data);
      this.subscriptionsTotal.set(meta?.total ?? data.items.length);
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load subscriptions.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadInvoices(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data, meta } = await firstValueFrom(
        this.api.getWithMeta<InvoiceListDto>('/invoices', {
          page: this.invoicesPage(),
          pageSize: this.pageSize(),
        }),
      );
      this.invoices.set(data);
      this.invoicesTotal.set(meta?.total ?? data.items.length);
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load invoices.');
    } finally {
      this.loading.set(false);
    }
  }

  goToSubscriptionsPage(page: number): void {
    this.subscriptionsPage.set(Math.min(Math.max(1, page), this.subscriptionsTotalPages()));
    void this.loadSubscriptions();
  }

  goToInvoicesPage(page: number): void {
    this.invoicesPage.set(Math.min(Math.max(1, page), this.invoicesTotalPages()));
    void this.loadInvoices();
  }

  async loadBillingDetail(subscriptionId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.detail.set(
        await firstValueFrom(
          this.api.get<BillingDetailDto>(`/billing/subscription/${subscriptionId}`),
        ),
      );
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load this billing record.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadInvoice(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.invoice.set(await firstValueFrom(this.api.get('/invoices/' + id)));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load this invoice.');
    } finally {
      this.loading.set(false);
    }
  }

  async recordPayment(invoiceId: string, body: unknown): Promise<void> {
    await firstValueFrom(this.api.post(`/invoices/${invoiceId}/payments`, body));
    await this.loadInvoice(invoiceId);
  }

  async modifySubscription(subscriptionId: string, body: unknown): Promise<void> {
    await firstValueFrom(this.api.post(`/subscriptions/${subscriptionId}/modify`, body));
    await this.loadBillingDetail(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string, body: unknown): Promise<void> {
    await firstValueFrom(this.api.post(`/subscriptions/${subscriptionId}/cancel`, body));
    await this.loadBillingDetail(subscriptionId);
  }
}

@Injectable({ providedIn: 'root' })
export class DealHealthStore {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dashboard = signal<DealHealthDashboardDto | null>(null);
  readonly alerts = computed(() => this.dashboard()?.alerts ?? []);

  async load(type?: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.dashboard.set(
        await firstValueFrom(this.api.get<DealHealthDashboardDto>('/deal-health', { type })),
      );
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load deal health.');
    } finally {
      this.loading.set(false);
    }
  }

  /** `POST /deal-health/:id/{nudge,escalate}`. */
  async act(alertId: string, action: 'nudge' | 'escalate', note?: string): Promise<void> {
    await firstValueFrom(this.api.post(`/deal-health/${alertId}/${action}`, { note }));
    await this.load();
  }
}

@Injectable({ providedIn: 'root' })
export class ReportingStore {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dashboard = signal<ReportingDashboardDto | null>(null);

  async load(filters: Record<string, string | undefined> = {}): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.dashboard.set(
        await firstValueFrom(this.api.get<ReportingDashboardDto>('/reporting', filters)),
      );
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load reporting.');
    } finally {
      this.loading.set(false);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class AdminConfigStore {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly config = signal<ApprovalChainConfigDto | null>(null);
  /** What the last save actually changed — screen 18's proof that it is live. */
  readonly lastImpact = signal<
    { quotationNumber: string; previousScore: number; newScore: number; autoApproved: boolean }[]
  >([]);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.config.set(await firstValueFrom(this.api.get<ApprovalChainConfigDto>('/config')));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load governance configuration.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(body: Record<string, unknown>): Promise<number> {
    this.saving.set(true);
    try {
      const result = await firstValueFrom(this.api.put<any>('/config', body));
      this.config.set(result.config);
      this.lastImpact.set(result.reevaluated ?? []);
      return result.reevaluated?.length ?? 0;
    } finally {
      this.saving.set(false);
    }
  }
}

/**
 * The header notification bell (screens 2 / 14). Loaded once on shell init and
 * refreshed after any action that writes a notification (a nudge, an escalate).
 * No sockets — a manual refresh and post-action reload is the P2 contract.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly list = signal<NotificationListDto | null>(null);

  readonly items = computed<NotificationDto[]>(() => this.list()?.items ?? []);
  readonly unreadCount = computed(() => this.list()?.unreadCount ?? 0);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.list.set(
        await firstValueFrom(this.api.get<NotificationListDto>('/notifications', { pageSize: 20 })),
      );
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load notifications.');
    } finally {
      this.loading.set(false);
    }
  }

  async markRead(id: string): Promise<void> {
    // Optimistic: flip locally, then reconcile from the server.
    this.list.update((l) =>
      l
        ? {
            items: l.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
            unreadCount: Math.max(
              0,
              l.unreadCount - (l.items.find((n) => n.id === id && !n.read) ? 1 : 0),
            ),
          }
        : l,
    );
    try {
      await firstValueFrom(this.api.patch(`/notifications/${id}/read`, {}));
    } finally {
      await this.load();
    }
  }

  async markAllRead(): Promise<void> {
    this.list.update((l) =>
      l ? { items: l.items.map((n) => ({ ...n, read: true })), unreadCount: 0 } : l,
    );
    try {
      await firstValueFrom(this.api.post('/notifications/read-all', {}));
    } finally {
      await this.load();
    }
  }
}

export { loader };
