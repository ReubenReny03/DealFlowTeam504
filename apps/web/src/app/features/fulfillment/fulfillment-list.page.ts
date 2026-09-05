import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY_STATES } from '@dealflow/shared';
import { FulfillmentStore } from '../../core/state/feature.stores';
import { EmptyStateComponent, ErrorStateComponent, LoadingComponent, StatusChipComponent } from '../../shared/ui';

/** Screen 7 — live stock per warehouse, and everything awaiting fulfillment. */
@Component({
  selector: 'df-fulfillment-list',
  standalone: true,
  imports: [LoadingComponent, ErrorStateComponent, EmptyStateComponent, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Fulfillment and Stock</h1>
    <p class="df-muted mt-1">Availability is always in stock minus reserved — a reservation is real, not a note.</p>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="5" label="Loading stock" /></div>
    } @else if (store.error()) {
      <div class="mt-6"><df-error-state [message]="store.error()!" (retry)="reload()" /></div>
    } @else {
      <section class="mt-6">
        <h2 class="df-h2 mb-3">Live stock</h2>
        <div class="df-card df-scroll-x">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr>
                <th class="df-th">Warehouse</th><th class="df-th">Product</th>
                <th class="df-th text-right">In Stock</th><th class="df-th text-right">Reserved</th><th class="df-th text-right">Available</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of store.stock(); track row.id) {
                <tr>
                  <td class="df-td font-medium text-slate-800">{{ row.warehouseName }}</td>
                  <td class="df-td">{{ row.productName }}</td>
                  <td class="df-td text-right font-mono">{{ row.inStock }}</td>
                  <td class="df-td text-right font-mono text-slate-500">{{ row.reserved }}</td>
                  <td class="df-td text-right font-mono font-semibold" [class.text-rose-600]="row.available === 0">{{ row.available }}</td>
                </tr>
              } @empty {
                <tr><td class="df-td py-8 text-center text-slate-400" colspan="5">No stock records.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="mt-8">
        <h2 class="df-h2 mb-3">Orders Awaiting Fulfillment</h2>
        @if (store.awaiting().length) {
          <div class="df-card df-scroll-x">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50">
                <tr><th class="df-th">Order</th><th class="df-th">Customer</th><th class="df-th">Status</th><th class="df-th">Warehouse</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of store.awaiting(); track row.fulfillmentId) {
                  <tr class="cursor-pointer transition hover:bg-slate-50" (click)="open(row.fulfillmentId)">
                    <td class="df-td font-mono font-medium text-slate-800">{{ row.orderNumber }}</td>
                    <td class="df-td">{{ row.customerName }}</td>
                    <td class="df-td"><df-status-chip kind="fulfillment" [value]="row.status" /></td>
                    <td class="df-td text-slate-600">{{ row.warehouses }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <df-empty-state icon="📦" [title]="empty.title" [body]="empty.body" />
        }
      </section>
    }
  `,
})
export class FulfillmentListPage implements OnInit {
  protected readonly store = inject(FulfillmentStore);
  private readonly router = inject(Router);
  protected readonly empty = EMPTY_STATES['fulfillment'];

  ngOnInit(): void { void this.store.load(); }
  reload(): void { void this.store.load(); }
  open(id: string): void { void this.router.navigate(['/app/fulfillment', id]); }
}
