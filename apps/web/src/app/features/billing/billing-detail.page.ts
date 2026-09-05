import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BillingStore } from '../../core/state/feature.stores';
import { ToastStore } from '../../core/state/toast.store';
import {
  ConfirmDialogComponent, ErrorStateComponent, LoadingComponent, MoneyPipe,
  ShortDatePipe, StatusChipComponent,
} from '../../shared/ui';

/**
 * SCREEN 10 — Billing Detail.
 *
 * The screen that proves the hybrid model: the one-time lines from the
 * originating order sit above the recurring lines with their own schedule, and
 * neither ever contains the other.
 */
@Component({
  selector: 'df-billing-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, ShortDatePipe, StatusChipComponent, ConfirmDialogComponent, LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <df-loading [count]="5" label="Loading billing" />
    } @else if (store.error()) {
      <df-error-state [message]="store.error()!" (retry)="reload()" />
    } @else {
      @if (store.detail(); as d) {
      <a routerLink="/app/subscriptions" class="text-sm text-slate-500 hover:text-slate-800">← Subscriptions</a>
      <div class="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="df-h1">{{ d.customer.name }}</h1>
          <p class="df-muted mt-1">
            @if (d.order) { From order {{ d.order.number }} · confirmed {{ d.order.confirmedAt | shortDate }} }
            @else { Standalone subscription }
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="df-btn-ghost" (click)="modifyOpen.set(true)">Modify Subscription</button>
          <button type="button" class="df-btn-danger" (click)="cancelOpen.set(true)">Cancel Subscription</button>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 class="df-h2 mb-3">One-Time Lines <span class="text-sm font-normal text-slate-400">(from the originating order)</span></h2>
          <div class="df-card divide-y divide-slate-100">
            @for (line of d.oneTimeLines; track line.description) {
              <div class="flex items-center justify-between px-4 py-3">
                <span class="text-sm text-slate-700">{{ line.description }}</span>
                <span class="text-sm font-semibold text-slate-900">{{ line.total | money }}</span>
              </div>
            } @empty {
              <p class="px-4 py-8 text-center text-sm text-slate-400">This order had no one-time lines.</p>
            }
          </div>
        </section>

        <section>
          <h2 class="df-h2 mb-3">Recurring Lines</h2>
          <div class="df-card df-scroll-x">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50">
                <tr>
                  <th class="df-th">Plan</th><th class="df-th">Cycle</th>
                  <th class="df-th">Next Bill Date</th><th class="df-th text-right">Amount</th><th class="df-th">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (line of d.recurringLines; track line.subscriptionId) {
                  <tr>
                    <td class="df-td font-medium text-slate-800">{{ line.planName }}</td>
                    <td class="df-td"><df-status-chip kind="cycle" [value]="line.cycle" /></td>
                    <td class="df-td text-slate-600">{{ line.nextBillDate ? (line.nextBillDate | shortDate) : '—' }}</td>
                    <td class="df-td text-right font-semibold">{{ line.amount | money }}</td>
                    <td class="df-td"><df-status-chip kind="subscription" [value]="line.status" /></td>
                  </tr>
                } @empty {
                  <tr><td class="df-td py-8 text-center text-slate-400" colspan="5">No recurring lines.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-xs leading-relaxed text-slate-500">
            A recurring line is invoiced at the <em>beginning</em> of each period, and never appears on the one-time invoice.
          </p>
        </section>
      </div>

      <section class="mt-8">
        <h2 class="df-h2 mb-3">Invoices for this customer</h2>
        <div class="df-card df-scroll-x">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr><th class="df-th">Invoice #</th><th class="df-th">Type</th><th class="df-th text-right">Amount</th><th class="df-th">Status</th><th class="df-th">Due</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (inv of d.invoices; track inv.id) {
                <tr>
                  <td class="df-td font-mono font-medium">{{ inv.number }}</td>
                  <td class="df-td text-slate-600">{{ inv.type === 'RECURRING' ? 'Recurring' : 'One-time' }}</td>
                  <td class="df-td text-right font-semibold">{{ inv.total | money: inv.currency }}</td>
                  <td class="df-td"><df-status-chip kind="invoice" [value]="inv.status" /></td>
                  <td class="df-td text-slate-600">{{ inv.dueDate | shortDate }}</td>
                </tr>
              } @empty {
                <tr><td class="df-td py-8 text-center text-slate-400" colspan="5">No invoices yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <df-confirm-dialog
        [open]="modifyOpen()"
        title="Modify this subscription?"
        message="A mid-cycle change is prorated: the unused part of the old amount is credited, the new amount is charged over the same remainder, and the net lands on the next invoice — or becomes a credit note if it is negative."
        confirmLabel="Apply change" tone="primary"
        reasonLabel="Why are you changing it?"
        (confirmed)="modify($event)" (cancel)="modifyOpen.set(false)" />

      <df-confirm-dialog
        [open]="cancelOpen()"
        title="Cancel this subscription?"
        message="Cancelling stops the schedule and settles the current period under the configured cancellation rule. Under PRORATED, a credit note is issued for the unused days."
        confirmLabel="Cancel subscription" tone="danger"
        reasonLabel="Reason for cancelling"
        (confirmed)="cancelSub($event)" (cancel)="cancelOpen.set(false)" />
      }
    }
  `,
})
export class BillingDetailPage implements OnInit {
  protected readonly store = inject(BillingStore);
  private readonly toast = inject(ToastStore);
  readonly id = input<string>('');
  protected readonly modifyOpen = signal(false);
  protected readonly cancelOpen = signal(false);

  ngOnInit(): void { void this.store.loadBillingDetail(this.id()); }
  reload(): void { void this.store.loadBillingDetail(this.id()); }

  modify(_reason: string): void {
    this.modifyOpen.set(false);
    this.toast.info('Not wired up yet', 'POST /subscriptions/:id/modify with proration is Agent D, task D-8 in docs/AGENT_D.md.');
  }
  cancelSub(_reason: string): void {
    this.cancelOpen.set(false);
    this.toast.info('Not wired up yet', 'POST /subscriptions/:id/cancel with the credit note is Agent D, task D-9 in docs/AGENT_D.md.');
  }
}
