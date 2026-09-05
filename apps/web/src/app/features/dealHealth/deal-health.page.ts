import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertType, EMPTY_STATES, type DealAlertDto } from '@dealflow/shared';
import { DealHealthStore } from '../../core/state/feature.stores';
import { ToastStore } from '../../core/state/toast.store';
import {
  EmptyStateComponent, ErrorStateComponent, KpiTileComponent, LoadingComponent, ShortDatePipe,
} from '../../shared/ui';

/** Screen 14 — Deal Health & Anomaly Dashboard. */
@Component({
  selector: 'df-deal-health',
  standalone: true,
  imports: [KpiTileComponent, LoadingComponent, ErrorStateComponent, EmptyStateComponent, ShortDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Deal Health & Anomalies</h1>
    <p class="df-muted mt-1">Deals that have gone quiet, discounts out of character for the rep, and delivery promises at risk.</p>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="4" label="Loading deal health" /></div>
    } @else if (store.error()) {
      <div class="mt-6"><df-error-state [message]="store.error()!" (retry)="reload()" /></div>
    } @else {
      @if (store.dashboard(); as d) {
      <div class="mt-6 grid gap-4 sm:grid-cols-3">
        <df-kpi-tile label="Stalled Deals" [value]="d.stalledDeals"
          [caption]="'Quotes idle past the ' + 7 + '-day threshold'" [tone]="d.stalledDeals ? 'warn' : 'good'" />
        <df-kpi-tile label="Discount Anomalies" [value]="d.discountAnomalies"
          caption="Above the owning rep's own average" [tone]="d.discountAnomalies ? 'danger' : 'good'" />
        <df-kpi-tile label="Delivery Slippage" [value]="d.deliverySlippage"
          caption="Promise dates at risk" [tone]="d.deliverySlippage ? 'warn' : 'good'" />
      </div>

      @if (store.alerts().length) {
        <div class="df-card df-scroll-x mt-6">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr><th class="df-th">Deal</th><th class="df-th">Issue</th><th class="df-th">Flagged</th><th class="df-th">Owner</th><th class="df-th text-right">Action</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (alert of store.alerts(); track alert.id) {
                <tr>
                  <td class="df-td">
                    <button type="button" class="font-medium text-brand-700 hover:underline" (click)="open(alert)">{{ alert.entityLabel }}</button>
                    <p class="mt-0.5 max-w-md text-xs leading-snug text-slate-400">{{ alert.detail }}</p>
                  </td>
                  <td class="df-td">
                    <span class="df-chip" [class]="issueClass(alert)">{{ alert.issue }}</span>
                  </td>
                  <td class="df-td text-slate-500">{{ alert.flaggedAt | shortDate }}</td>
                  <td class="df-td text-slate-600">{{ alert.ownerName }}</td>
                  <td class="df-td text-right">
                    @if (alert.actions.length) {
                      <span class="text-xs text-slate-500">
                        {{ alert.actions[alert.actions.length - 1].note ?? alert.status }}
                      </span>
                    } @else {
                      <div class="flex justify-end gap-1.5">
                        <button type="button" class="df-btn-ghost !px-2 !py-1 text-xs" (click)="act(alert, 'nudge')">Nudge Rep</button>
                        <button type="button" class="df-btn-danger !px-2 !py-1 text-xs" (click)="act(alert, 'escalate')">Escalate</button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="mt-6"><df-empty-state icon="💚" [title]="empty.title" [body]="empty.body" /></div>
      }
      }
    }
  `,
})
export class DealHealthPage implements OnInit {
  protected readonly store = inject(DealHealthStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastStore);
  protected readonly empty = EMPTY_STATES['dealHealth'];

  ngOnInit(): void { void this.store.load(); }
  reload(): void { void this.store.load(); }

  issueClass(alert: DealAlertDto): string {
    switch (alert.type) {
      case AlertType.DISCOUNT_ANOMALY: return 'border-rose-200 bg-rose-100 text-rose-800';
      case AlertType.DELIVERY_SLIPPAGE: return 'border-sky-200 bg-sky-100 text-sky-800';
      default: return 'border-amber-200 bg-amber-100 text-amber-800';
    }
  }

  /** Clicking an alert opens the deal it is about. */
  open(alert: DealAlertDto): void {
    if (alert.quotationId) void this.router.navigate(['/app/quotations', alert.quotationId]);
  }

  async act(alert: DealAlertDto, action: 'nudge' | 'escalate'): Promise<void> {
    try {
      await this.store.act(alert.id, action);
      this.toast.success(action === 'nudge' ? 'Nudge sent' : 'Escalated', `${alert.ownerName} has been notified.`);
    } catch {
      /* the interceptor already toasted the reason (e.g. an already-resolved alert) */
    }
  }
}
