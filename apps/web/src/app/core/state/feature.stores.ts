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
  OrderDto,
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

  readonly counts = computed(() => this.list()?.counts ?? { pending: 0, returned: 0, approved: 0, rejected: 0 });
  readonly items = computed(() => this.list()?.items ?? []);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.list.set(
        await firstValueFrom(this.api.get<ApprovalListDto>('/approvals', { pendingOnly: this.pendingOnly() || undefined })),
      );
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load the approval queue.');
    } finally {
      this.loading.set(false);
    }
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
  async decide(id: string, action: 'approve' | 'return' | 'reject', reason: string): Promise<ApprovalDto> {
    const updated = await firstValueFrom(this.api.post<ApprovalDto>(`/approvals/${id}/${action}`, { reason }));
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
  readonly invoice = signal<{ invoice: InvoiceDto; order: OrderDto | null; relatedInvoices: InvoiceDto[] } | null>(null);

  async loadSubscriptions(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.subscriptions.set(await firstValueFrom(this.api.get<SubscriptionListDto>('/subscriptions'))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load subscriptions.'); }
    finally { this.loading.set(false); }
  }

  async loadInvoices(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.invoices.set(await firstValueFrom(this.api.get<InvoiceListDto>('/invoices'))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load invoices.'); }
    finally { this.loading.set(false); }
  }

  async loadBillingDetail(subscriptionId: string): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.detail.set(await firstValueFrom(this.api.get<BillingDetailDto>(`/billing/subscription/${subscriptionId}`))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load this billing record.'); }
    finally { this.loading.set(false); }
  }

  async loadInvoice(id: string): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.invoice.set(await firstValueFrom(this.api.get('/invoices/' + id))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load this invoice.'); }
    finally { this.loading.set(false); }
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
    this.loading.set(true); this.error.set(null);
    try { this.dashboard.set(await firstValueFrom(this.api.get<DealHealthDashboardDto>('/deal-health', { type }))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load deal health.'); }
    finally { this.loading.set(false); }
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
    this.loading.set(true); this.error.set(null);
    try { this.dashboard.set(await firstValueFrom(this.api.get<ReportingDashboardDto>('/reporting', filters))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load reporting.'); }
    finally { this.loading.set(false); }
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
  readonly lastImpact = signal<{ quotationNumber: string; previousScore: number; newScore: number; autoApproved: boolean }[]>([]);

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.config.set(await firstValueFrom(this.api.get<ApprovalChainConfigDto>('/config'))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load governance configuration.'); }
    finally { this.loading.set(false); }
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

export { loader };
