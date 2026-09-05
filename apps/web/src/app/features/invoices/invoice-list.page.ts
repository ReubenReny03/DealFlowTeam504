import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY_STATES, type InvoiceDto } from '@dealflow/shared';
import { BillingStore } from '../../core/state/feature.stores';
import {
  ColumnDef,
  DataTableComponent,
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingComponent,
  MoneyPipe,
  PaginatorComponent,
  ShortDatePipe,
  StatusChipComponent,
} from '../../shared/ui';

/** Screen 12 — Invoices. */
@Component({
  selector: 'df-invoice-list',
  standalone: true,
  imports: [
    DataTableComponent,
    LoadingComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    MoneyPipe,
    ShortDatePipe,
    StatusChipComponent,
    PaginatorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Invoices</h1>
    <p class="df-muted mt-1">
      Nothing is billed before it ships — a partial delivery produces a partial invoice.
    </p>

    <div class="mt-4 flex flex-wrap gap-2">
      <span class="df-chip border-rose-200 bg-rose-100 text-rose-800"
        >{{ counts().unpaid }} Unpaid</span
      >
      <span class="df-chip border-emerald-200 bg-emerald-100 text-emerald-800"
        >{{ counts().paid }} Paid</span
      >
      @if (counts().overdue > 0) {
        <span class="df-chip border-rose-300 bg-rose-200 text-rose-900"
          >{{ counts().overdue }} Overdue</span
        >
      }
    </div>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="5" label="Loading invoices" /></div>
    } @else if (store.error()) {
      <div class="mt-6"><df-error-state [message]="store.error()!" (retry)="reload()" /></div>
    } @else if (items().length === 0) {
      <div class="mt-6"><df-empty-state icon="🧾" [title]="empty.title" [body]="empty.body" /></div>
    } @else {
      <div class="mt-4">
        <df-data-table
          [columns]="columns"
          [rows]="items()"
          [clickable]="true"
          (rowClick)="open($event)"
        >
          <ng-template #cell let-row let-col="col">
            @switch (col.key) {
              @case ('type') {
                <span class="text-slate-500">{{
                  row.type === 'RECURRING' ? 'Recurring' : 'One-time'
                }}</span>
              }
              @case ('amount') {
                <span class="font-semibold">{{ row.total | money: row.currency }}</span>
              }
              @case ('status') {
                <df-status-chip kind="invoice" [value]="row.status" />
              }
              @case ('due') {
                <span>{{ row.dueDate | shortDate }}</span>
              }
              @default {
                {{ col.value?.(row) ?? '—' }}
              }
            }
          </ng-template>
        </df-data-table>
        <df-paginator
          [page]="store.invoicesPage()"
          [pageSize]="store.pageSize()"
          [total]="store.invoicesTotal()"
          (go)="store.goToInvoicesPage($event)"
        />
      </div>
    }
  `,
})
export class InvoiceListPage implements OnInit {
  protected readonly store = inject(BillingStore);
  private readonly router = inject(Router);
  protected readonly empty = EMPTY_STATES['invoices'];

  protected readonly columns: ColumnDef<InvoiceDto>[] = [
    { key: 'number', header: 'Invoice #', value: (r) => r.number, mono: true, width: '9rem' },
    { key: 'customer', header: 'Customer', value: (r) => r.customerName },
    { key: 'type', header: 'Type', width: '8rem' },
    { key: 'amount', header: 'Amount', align: 'right', width: '9rem' },
    { key: 'status', header: 'Status', width: '8rem' },
    { key: 'due', header: 'Due Date', width: '8rem' },
  ];

  counts() {
    return this.store.invoices()?.counts ?? { unpaid: 0, paid: 0, overdue: 0 };
  }
  items() {
    return this.store.invoices()?.items ?? [];
  }

  ngOnInit(): void {
    void this.store.loadInvoices();
  }
  reload(): void {
    void this.store.loadInvoices();
  }
  open(row: InvoiceDto): void {
    void this.router.navigate(['/app/invoices', row.id]);
  }
}
