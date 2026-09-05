import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FulfillmentStore } from '../../core/state/feature.stores';
import { ToastStore } from '../../core/state/toast.store';
import {
  ConfirmDialogComponent, ErrorStateComponent, LoadingComponent, MoneyPipe,
  ShortDatePipe, StatusChipComponent,
} from '../../shared/ui';

/**
 * SCREEN 8 — Fulfillment Detail.
 *
 * The `rationale` list is the point of this screen: the split is not a guess,
 * and the reasoning is shown rather than hidden.
 */
@Component({
  selector: 'df-fulfillment-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, ShortDatePipe, StatusChipComponent, ConfirmDialogComponent, LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <df-loading [count]="5" label="Loading fulfillment" />
    } @else if (store.error()) {
      <df-error-state [message]="store.error()!" (retry)="reload()" />
    } @else {
      @if (store.current(); as f) {
      <a routerLink="/app/fulfillment" class="text-sm text-slate-500 hover:text-slate-800">← Fulfillment</a>
      <div class="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="df-h1">{{ f.orderNumber }} · {{ f.customerName }}</h1>
          <div class="mt-2 flex items-center gap-2">
            <df-status-chip kind="fulfillment" [value]="f.status" />
            @if (f.overridden) { <span class="df-chip border-slate-300 bg-slate-100 text-slate-700">Manually overridden</span> }
          </div>
        </div>
        <div class="flex gap-2">
          <button type="button" class="df-btn-primary" (click)="accept()">Accept Suggested Split</button>
          <button type="button" class="df-btn-ghost" (click)="overrideOpen.set(true)">Manual Override</button>
        </div>
      </div>

      @if (f.consolidationAvailableAt) {
        <div class="mt-5 flex items-start justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div>
            <p class="text-sm font-semibold text-sky-900">Consolidate Remaining Backorder</p>
            <p class="mt-1 text-sm leading-relaxed text-sky-800">
              Stock arrived and now covers the outstanding backorder. You can ship the remainder as one consolidated shipment
              instead of leaving it open.
            </p>
          </div>
          <button type="button" class="df-btn-primary shrink-0" (click)="consolidate()">Consolidate</button>
        </div>
      }

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
          <h2 class="df-h2 mb-3">Suggested split</h2>
          <div class="df-card df-scroll-x">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50">
                <tr>
                  <th class="df-th">Warehouse</th><th class="df-th">Lines</th>
                  <th class="df-th text-right">Qty Fulfilled</th><th class="df-th text-right">Est. Shipments</th><th class="df-th text-right">Cost</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (a of f.allocations; track a.warehouseId) {
                  <tr>
                    <td class="df-td font-medium text-slate-800">{{ a.warehouseName }}</td>
                    <td class="df-td text-slate-600">
                      @for (l of a.lines; track l.lineId) {
                        <span class="mr-2 whitespace-nowrap">{{ l.productName }} ×{{ l.qty }}</span>
                      }
                    </td>
                    <td class="df-td text-right font-mono">{{ a.qty }} units</td>
                    <td class="df-td text-right font-mono">{{ a.estShipments }}</td>
                    <td class="df-td text-right font-mono">{{ a.estCost | money }}</td>
                  </tr>
                }
                <tr class="bg-slate-50 font-semibold">
                  <td class="df-td" colspan="3">Total</td>
                  <td class="df-td text-right font-mono">{{ f.totalShipments }}</td>
                  <td class="df-td text-right font-mono">{{ f.totalCost | money }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          @if (f.backorders.length) {
            <h2 class="df-h2 mb-3 mt-8">Backorder</h2>
            <div class="df-card df-scroll-x">
              <table class="min-w-full divide-y divide-slate-200">
                <thead class="bg-slate-50">
                  <tr><th class="df-th">Product</th><th class="df-th text-right">Qty</th><th class="df-th">Expected from</th><th class="df-th">ETA</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (b of f.backorders; track b.lineId + b.productId) {
                    <tr>
                      <td class="df-td">{{ b.productName }}</td>
                      <td class="df-td text-right font-mono text-rose-600">{{ b.qty }}</td>
                      <td class="df-td text-slate-600">{{ b.warehouseName ?? '—' }}</td>
                      <td class="df-td text-slate-600">{{ b.etaDate | shortDate }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <aside>
          <div class="df-card p-5">
            <h2 class="df-h2">Why this split</h2>
            <ol class="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
              @for (line of f.rationale; track line) {
                <li class="flex gap-2"><span class="text-slate-300">→</span><span>{{ line }}</span></li>
              } @empty {
                <li class="text-slate-400">No rationale recorded.</li>
              }
            </ol>
            @if (f.overrideReason) {
              <div class="mt-4 rounded-lg bg-slate-50 p-3">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Overridden by {{ f.overriddenBy }}</p>
                <p class="mt-1 text-sm text-slate-700">{{ f.overrideReason }}</p>
              </div>
            }
          </div>
        </aside>
      </div>

      <df-confirm-dialog
        [open]="overrideOpen()"
        title="Override the suggested split?"
        message="A manual allocation is validated against live availability and is written to the audit trail with your reason. Agent D wires the allocation editor (docs/AGENT_D.md, task D-4)."
        confirmLabel="Record override"
        tone="warn"
        reasonLabel="Why are you overriding the suggestion?"
        (confirmed)="override($event)"
        (cancel)="overrideOpen.set(false)"
      />
      }
    }
  `,
})
export class FulfillmentDetailPage implements OnInit {
  protected readonly store = inject(FulfillmentStore);
  private readonly toast = inject(ToastStore);
  readonly id = input<string>('');
  protected readonly overrideOpen = signal(false);

  ngOnInit(): void { void this.store.loadOne(this.id()); }
  reload(): void { void this.store.loadOne(this.id()); }

  async accept(): Promise<void> {
    try {
      await this.store.acceptSplit(this.id());
      this.toast.success('Split accepted', 'Stock has been reserved against these warehouses.');
    } catch {
      this.toast.error('Not wired up yet', 'POST /fulfillment/:id/accept is Agent D, task D-3 in docs/AGENT_D.md.');
    }
  }

  async override(reason: string): Promise<void> {
    this.overrideOpen.set(false);
    try {
      await this.store.overrideSplit(this.id(), this.store.current()?.allocations ?? [], reason);
      this.toast.success('Override recorded', 'Written to the audit trail with your reason.');
    } catch {
      this.toast.error('Not wired up yet', 'POST /fulfillment/:id/override is Agent D, task D-4 in docs/AGENT_D.md.');
    }
  }

  consolidate(): void {
    this.toast.info('Consolidation', 'Agent D wires this to the backorder consolidation endpoint (task D-5).');
  }
}
