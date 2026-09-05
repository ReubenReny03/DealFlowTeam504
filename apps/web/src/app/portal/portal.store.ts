import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PortalCounterResponse, PortalResolveResponse } from '@dealflow/shared';
import { ApiService } from '../core/api/api.service';
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

  readonly quotation = computed(() => this.data()?.quotation ?? null);
  readonly events = computed(() => this.data()?.events ?? []);
  readonly canConfirm = computed(() => this.data()?.canConfirm ?? false);
  readonly negotiationNoticeText = computed(
    () =>
      this.data()?.negotiationNotice ??
      'If the final terms go beyond what your account manager can approve on their own, the quotation goes back for internal approval automatically.',
  );

  async load(numberOrId?: string): Promise<void> {
    const target = numberOrId ?? this.session.portalQuotationId();
    if (!target) {
      this.error.set('There is no quotation linked to this session yet.');
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

  /** AGENT C: POST /portal/q/:number/comment — a question, with no counter attached. */
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
   * AGENT C: POST /portal/q/:number/counter.
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
      return result;
    } finally {
      this.submitting.set(false);
    }
  }

  /** AGENT C: POST /portal/q/:number/confirm — then Agent D's order creation. */
  async confirm(): Promise<void> {
    const number = this.quotation()!.number;
    this.submitting.set(true);
    try {
      await firstValueFrom(this.api.post(`/portal/q/${number}/confirm`, {}));
      await this.load(number);
    } finally {
      this.submitting.set(false);
    }
  }
}
