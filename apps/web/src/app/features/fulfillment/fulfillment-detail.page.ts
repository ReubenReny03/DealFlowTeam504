import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FulfillmentStatus, Role, type FulfillmentDto } from '@dealflow/shared';
import { BillingStore, FulfillmentStore } from '../../core/state/feature.stores';
import { SessionStore } from '../../core/state/session.store';
import { ToastStore } from '../../core/state/toast.store';
import { liveRefresh } from '../../core/realtime/live-refresh';
import { SocketEvent } from '@dealflow/shared';
import {
  ErrorStateComponent, LoadingComponent, ModalComponent, MoneyPipe,
  ShortDatePipe, StatusChipComponent,
} from '../../shared/ui';

interface OverrideRow {
  warehouseId: string;
  qty: number;
}

interface OverrideLine {
  lineId: string;
  productId: string;
  productName: string;
  totalQty: number;
  rows: OverrideRow[];
}

/**
 * SCREEN 8 — Fulfillment Detail.
 *
 * The `rationale` list is the point of this screen: the split is not a guess,
 * and the reasoning is shown rather than hidden.
 */
@Component({
  selector: 'df-fulfillment-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, MoneyPipe, ShortDatePipe, StatusChipComponent, ModalComponent, LoadingComponent, ErrorStateComponent],
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
          <button type="button" class="df-btn-ghost" (click)="openOverride()">Manual Override</button>
          @if (canManageFulfillment() && canShip(f)) {
            <button type="button" class="df-btn-primary" (click)="ship()">Ship</button>
          }
          @if (canManageFulfillment() && canInvoice(f)) {
            <button type="button" class="df-btn-success" (click)="generateInvoice()">Generate Invoice</button>
          }
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

      <df-modal [open]="overrideOpen()" title="Manual Override" subtitle="Reassign this order across warehouses" (close)="overrideOpen.set(false)">
        <div class="max-h-[60vh] space-y-4 overflow-y-auto">
          @for (line of overrideLines; track line.lineId) {
            <div class="rounded-lg border border-slate-200 p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-slate-800">{{ line.productName }}</span>
                <span
                  class="text-xs font-mono"
                  [class.text-emerald-600]="allocatedQty(line) === line.totalQty"
                  [class.text-rose-600]="allocatedQty(line) !== line.totalQty"
                >
                  {{ allocatedQty(line) }} / {{ line.totalQty }} allocated
                </span>
              </div>
              <div class="mt-2 space-y-2">
                @for (row of line.rows; track $index) {
                  <div class="flex items-center gap-2">
                    <select class="df-input" [(ngModel)]="row.warehouseId" [attr.aria-label]="'Warehouse for ' + line.productName">
                      @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                    </select>
                    <input
                      class="df-input w-24 text-right"
                      type="number"
                      min="0"
                      [(ngModel)]="row.qty"
                      [attr.aria-label]="'Quantity for ' + line.productName"
                    />
                    <button type="button" class="df-btn-ghost !px-2" (click)="removeRow(line, $index)" aria-label="Remove this row">✕</button>
                  </div>
                }
                <button type="button" class="text-xs font-medium text-brand-700 hover:underline" (click)="addRow(line)">
                  + Add warehouse
                </button>
              </div>
            </div>
          } @empty {
            <p class="text-sm text-slate-400">Nothing to allocate — this order has no stockable lines.</p>
          }

          <label class="block">
            <span class="df-label">Why are you overriding the suggestion?</span>
            <input class="df-input" [(ngModel)]="overrideReason" placeholder="e.g. Reserve for a VIP account from East Depot" />
          </label>
          <p class="text-xs leading-relaxed text-slate-500">
            Any quantity left unallocated for a line goes on backorder, the same as the suggested split. The allocation is validated
            against live availability and written to the audit trail with your reason.
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="df-btn-ghost" (click)="overrideOpen.set(false)">Cancel</button>
            <button type="button" class="df-btn-warn" [disabled]="!overrideReason.trim()" (click)="submitOverride()">Record override</button>
          </div>
        </div>
      </df-modal>
      }
    }
  `,
})
export class FulfillmentDetailPage implements OnInit {
  protected readonly store = inject(FulfillmentStore);
  private readonly billing = inject(BillingStore);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastStore);
  private readonly router = inject(Router);
  readonly id = input<string>('');

  /**
   * Shipping and invoicing are Finance/Ops' call, not a rep's or a Sales
   * Manager's (spec: "Finance / Operations User ... manages warehouse
   * fulfillment splits and backorder decisions") — so these two actions are
   * gated in the UI, not just left to the API's 403.
   */
  protected readonly canManageFulfillment = computed(() => {
    const role = this.session.role();
    return role === Role.ADMIN || role === Role.FINANCE;
  });

  protected readonly overrideOpen = signal(false);
  protected overrideLines: OverrideLine[] = [];
  protected overrideReason = '';

  /** Every warehouse the live stock table knows about, for the row selects. */
  protected readonly warehouses = computed(() => {
    const byId = new Map<string, string>();
    for (const s of this.store.stock()) byId.set(s.warehouseId, s.warehouseName);
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  });

  constructor() {
    liveRefresh([SocketEvent.FULFILLMENT_UPDATED], () => this.reload(), {
      when: (e) => e.fulfillmentId === this.id(),
    });
  }

  ngOnInit(): void {
    void this.store.loadOne(this.id());
    void this.store.load();
  }
  reload(): void { void this.store.loadOne(this.id()); }

  async accept(): Promise<void> {
    try {
      await this.store.acceptSplit(this.id());
      this.toast.success('Split accepted', 'Stock has been reserved against these warehouses.');
    } catch {
      /* the interceptor already toasted the reason (e.g. 409 INSUFFICIENT_STOCK) */
    }
  }

  /** Mirrors the API's own guard on `POST /:id/ship` — reserved, and not already shipped or cancelled. */
  canShip(f: FulfillmentDto): boolean {
    return f.reserved && f.status !== FulfillmentStatus.SHIPPED && f.status !== FulfillmentStatus.CANCELLED;
  }

  /** Something has to have actually left the warehouse before there's anything new to bill. */
  canInvoice(f: FulfillmentDto): boolean {
    return f.status === FulfillmentStatus.SHIPPED || f.status === FulfillmentStatus.PARTIALLY_SHIPPED;
  }

  async ship(): Promise<void> {
    try {
      await this.store.ship(this.id());
      this.toast.success('Shipped', 'Stock has left the warehouse — generate the invoice for what shipped when ready.');
    } catch {
      /* the interceptor already toasted the reason */
    }
  }

  async generateInvoice(): Promise<void> {
    const f = this.store.current();
    if (!f) return;
    try {
      const { invoice, message } = await this.billing.generateInvoice(f.orderId);
      if (invoice) {
        this.toast.success('Invoice generated', message);
        await this.router.navigate(['/app/invoices', invoice.id]);
      } else {
        this.toast.info('Nothing to invoice', message);
      }
    } catch {
      /* the interceptor already toasted the reason */
    }
  }

  /** Seeds the editor from the CURRENT split — allocated lines pre-filled, backordered lines start unassigned. */
  openOverride(): void {
    const f = this.store.current();
    if (!f) return;
    const byLine = new Map<string, OverrideLine>();
    for (const a of f.allocations) {
      for (const l of a.lines) {
        const entry = byLine.get(l.lineId) ?? { lineId: l.lineId, productId: l.productId, productName: l.productName, totalQty: 0, rows: [] };
        entry.totalQty += l.qty;
        entry.rows.push({ warehouseId: a.warehouseId, qty: l.qty });
        byLine.set(l.lineId, entry);
      }
    }
    for (const b of f.backorders) {
      const entry = byLine.get(b.lineId) ?? { lineId: b.lineId, productId: b.productId, productName: b.productName, totalQty: 0, rows: [] };
      entry.totalQty += b.qty;
      byLine.set(b.lineId, entry);
    }
    this.overrideLines = [...byLine.values()];
    this.overrideReason = '';
    this.overrideOpen.set(true);
  }

  allocatedQty(line: OverrideLine): number {
    return line.rows.reduce((a, r) => a + (r.qty || 0), 0);
  }

  addRow(line: OverrideLine): void {
    line.rows.push({ warehouseId: this.warehouses()[0]?.id ?? '', qty: 0 });
  }

  removeRow(line: OverrideLine, index: number): void {
    line.rows.splice(index, 1);
  }

  async submitOverride(): Promise<void> {
    const allocations = groupRowsByWarehouse(this.overrideLines);
    this.overrideOpen.set(false);
    try {
      await this.store.overrideSplit(this.id(), allocations, this.overrideReason.trim());
      this.toast.success('Override recorded', 'Written to the audit trail with your reason.');
    } catch {
      /* the interceptor already toasted the reason (e.g. 409 INSUFFICIENT_STOCK) */
    }
  }

  async consolidate(): Promise<void> {
    try {
      await this.store.consolidate(this.id());
      this.toast.success('Consolidated', 'The remaining backorder shipped as one consolidated shipment.');
    } catch {
      /* the interceptor already toasted the reason */
    }
  }
}

/** The editor works per-line; the API takes allocations grouped per-warehouse. */
function groupRowsByWarehouse(lines: OverrideLine[]): { warehouseId: string; lines: { lineId: string; qty: number }[] }[] {
  const byWarehouse = new Map<string, { lineId: string; qty: number }[]>();
  for (const line of lines) {
    for (const row of line.rows) {
      if (!row.warehouseId || !row.qty || row.qty <= 0) continue;
      const rows = byWarehouse.get(row.warehouseId) ?? [];
      rows.push({ lineId: line.lineId, qty: row.qty });
      byWarehouse.set(row.warehouseId, rows);
    }
  }
  return [...byWarehouse.entries()].map(([warehouseId, lines]) => ({ warehouseId, lines }));
}
