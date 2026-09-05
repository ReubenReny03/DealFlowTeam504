import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ORDER_STEPPER, PaymentMethod } from '@dealflow/shared';
import { BillingStore } from '../../core/state/feature.stores';
import { ToastStore } from '../../core/state/toast.store';
import {
  ErrorStateComponent, LoadingComponent, ModalComponent, MoneyPipe,
  ShortDatePipe, Step, StepperComponent, StatusChipComponent,
} from '../../shared/ui';

/** Screen 13 — Invoice Detail, with the order stepper. */
@Component({
  selector: 'df-invoice-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, StepperComponent, StatusChipComponent, ModalComponent, MoneyPipe, ShortDatePipe, LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <df-loading [count]="5" label="Loading invoice" />
    } @else if (store.error()) {
      <df-error-state [message]="store.error()!" (retry)="reload()" />
    } @else {
      @if (store.invoice(); as v) {
      <a routerLink="/app/invoices" class="text-sm text-slate-500 hover:text-slate-800">← Invoices</a>
      <div class="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="df-h1">{{ v.invoice.number }} · {{ v.invoice.customerName }}</h1>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <df-status-chip kind="invoice" [value]="v.invoice.status" />
            <span class="df-muted">Issued {{ v.invoice.issueDate | shortDate }} · due {{ v.invoice.dueDate | shortDate }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          @if (v.invoice.amountDue > 0) {
            <button type="button" class="df-btn-success" (click)="paymentOpen.set(true)">Record Payment</button>
          }
          <button type="button" class="df-btn-ghost" (click)="download()">Download Summary</button>
        </div>
      </div>

      <div class="df-card mt-6 px-6 py-4"><df-stepper [steps]="steps()" /></div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
          <h2 class="df-h2 mb-3">Lines</h2>
          <div class="df-card df-scroll-x">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50">
                <tr>
                  <th class="df-th">Description</th><th class="df-th text-right">Qty</th>
                  <th class="df-th text-right">Unit</th><th class="df-th text-right">Net</th>
                  <th class="df-th text-right">Tax</th><th class="df-th text-right">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (line of v.invoice.lines; track line.lineId) {
                  <tr>
                    <td class="df-td">{{ line.description }}</td>
                    <td class="df-td text-right font-mono">{{ line.qty }}</td>
                    <td class="df-td text-right font-mono">{{ line.unitPrice | money }}</td>
                    <td class="df-td text-right font-mono">{{ line.net | money }}</td>
                    <td class="df-td text-right font-mono text-slate-500">{{ line.tax | money }}</td>
                    <td class="df-td text-right font-semibold">{{ line.total | money }}</td>
                  </tr>
                }
                <tr class="bg-slate-50 font-semibold">
                  <td class="df-td" colspan="5">Total</td>
                  <td class="df-td text-right">{{ v.invoice.total | money }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          @if (v.relatedInvoices.length > 1) {
            <h2 class="df-h2 mb-3 mt-8">All invoices for {{ v.invoice.orderNumber }}</h2>
            <p class="df-muted mb-3">One order, two billing artefacts: the one-time invoice and the recurring schedule, kept separate.</p>
            <div class="df-card divide-y divide-slate-100">
              @for (inv of v.relatedInvoices; track inv.id) {
                <a [routerLink]="['/app/invoices', inv.id]" class="flex items-center justify-between px-4 py-3 transition hover:bg-slate-50">
                  <div>
                    <span class="font-mono text-sm font-medium">{{ inv.number }}</span>
                    <span class="ml-2 text-sm text-slate-500">{{ inv.type === 'RECURRING' ? 'Recurring' : 'One-time' }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-sm font-semibold">{{ inv.total | money }}</span>
                    <df-status-chip kind="invoice" [value]="inv.status" />
                  </div>
                </a>
              }
            </div>
          }
        </section>

        <aside class="space-y-4">
          <div class="df-card p-5">
            <h2 class="df-h2">Balance</h2>
            <dl class="mt-3 space-y-1.5 text-sm">
              <div class="flex justify-between"><dt class="text-slate-500">Invoiced</dt><dd class="font-medium">{{ v.invoice.total | money }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">Paid</dt><dd class="font-medium text-emerald-600">{{ v.invoice.amountPaid | money }}</dd></div>
              <div class="flex justify-between border-t border-slate-200 pt-2 text-base">
                <dt class="font-semibold text-slate-700">Outstanding</dt>
                <dd class="font-semibold" [class]="v.invoice.amountDue > 0 ? 'text-rose-600' : 'text-emerald-600'">{{ v.invoice.amountDue | money }}</dd>
              </div>
            </dl>
          </div>

          <div class="df-card p-5">
            <h2 class="df-h2">Payments</h2>
            <ul class="mt-3 space-y-2 text-sm">
              @for (p of v.invoice.payments; track p.id) {
                <li class="flex items-start justify-between gap-2">
                  <div>
                    <p class="font-medium text-slate-800">{{ p.amount | money }}</p>
                    <p class="text-xs text-slate-400">{{ p.method }} · {{ p.reference }} · {{ p.recordedByName }}</p>
                  </div>
                  <span class="shrink-0 text-xs text-slate-400">{{ p.receivedAt | shortDate }}</span>
                </li>
              } @empty {
                <li class="text-sm text-slate-400">No payments recorded.</li>
              }
            </ul>
          </div>
        </aside>
      </div>

      <df-modal [open]="paymentOpen()" title="Record a payment" [subtitle]="v.invoice.number" (close)="paymentOpen.set(false)">
        <div class="space-y-3">
          <label class="block">
            <span class="df-label">Amount (in cents)</span>
            <input class="df-input" type="number" [(ngModel)]="amount" />
            <span class="mt-1 block text-xs text-slate-400">Outstanding: {{ v.invoice.amountDue | money }}</span>
          </label>
          <label class="block">
            <span class="df-label">Method</span>
            <select class="df-input" [(ngModel)]="method">
              @for (m of methods; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </label>
          <label class="block">
            <span class="df-label">Reference</span>
            <input class="df-input" [(ngModel)]="reference" placeholder="Bank reference or card last four" />
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="df-btn-ghost" (click)="paymentOpen.set(false)">Cancel</button>
            <button type="button" class="df-btn-success" (click)="pay()">Record payment</button>
          </div>
        </div>
      </df-modal>
      }
    }
  `,
})
export class InvoiceDetailPage implements OnInit {
  protected readonly store = inject(BillingStore);
  private readonly toast = inject(ToastStore);
  readonly id = input<string>('');

  protected readonly paymentOpen = signal(false);
  protected readonly methods = Object.values(PaymentMethod);
  amount = 0;
  method: string = PaymentMethod.BANK_TRANSFER;
  reference = '';

  ngOnInit(): void { void this.store.loadInvoice(this.id()); }
  reload(): void { void this.store.loadInvoice(this.id()); }

  /** Order Confirmed → Shipped → Invoiced → Paid. */
  readonly steps = computed<Step[]>(() => {
    const v = this.store.invoice();
    const status = v?.order?.status ?? (v?.invoice.status === 'PAID' ? 'PAID' : 'INVOICED');
    const reached = ORDER_STEPPER.indexOf(status as any);
    const labels = ['Order Confirmed', 'Shipped', 'Invoiced', 'Paid'];
    return labels.map((label, i) => ({
      label,
      state: i < reached ? 'done' : i === reached ? 'active' : 'pending',
    }));
  });

  async pay(): Promise<void> {
    this.paymentOpen.set(false);
    try {
      await this.store.recordPayment(this.id(), { amount: this.amount, method: this.method, reference: this.reference });
      this.toast.success('Payment recorded', 'The invoice and the order stepper have moved on.');
    } catch {
      this.toast.error('Not wired up yet', 'POST /invoices/:id/payments is Agent D, task D-10 in docs/AGENT_D.md.');
    }
  }

  download(): void {
    this.toast.info('Download Summary', 'CSV export is Agent D, task D-12 (P2 in docs/FEATURE_PRIORITY.md).');
  }
}
