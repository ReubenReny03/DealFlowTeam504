import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY_STATES, type SubscriptionDto } from '@dealflow/shared';
import { BillingStore } from '../../core/state/feature.stores';
import {
  ColumnDef, DataTableComponent, EmptyStateComponent, ErrorStateComponent,
  LoadingComponent, MoneyPipe, ShortDatePipe, StatusChipComponent,
} from '../../shared/ui';

/** Screen 9 — Subscriptions. */
@Component({
  selector: 'df-subscription-list',
  standalone: true,
  imports: [DataTableComponent, LoadingComponent, ErrorStateComponent, EmptyStateComponent, MoneyPipe, ShortDatePipe, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Subscriptions</h1>
        <p class="df-muted mt-1">Recurring lines live here with their own schedule, separate from the one-time invoice.</p>
      </div>
      <button type="button" class="df-btn-primary" (click)="newPlan()">+ New Plan (Admin)</button>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <span class="df-chip border-emerald-200 bg-emerald-100 text-emerald-800">{{ counts().active }} Active</span>
      <span class="df-chip border-amber-200 bg-amber-100 text-amber-800">{{ counts().paused }} Paused</span>
      <span class="df-chip border-slate-200 bg-slate-100 text-slate-600">{{ counts().cancelled }} Cancelled</span>
    </div>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="6" label="Loading subscriptions" /></div>
    } @else if (store.error()) {
      <div class="mt-6"><df-error-state [message]="store.error()!" (retry)="reload()" /></div>
    } @else if (items().length === 0) {
      <div class="mt-6"><df-empty-state icon="🔁" [title]="empty.title" [body]="empty.body" /></div>
    } @else {
      <div class="mt-4">
        <df-data-table [columns]="columns" [rows]="items()" [clickable]="true" (rowClick)="open($event)">
          <ng-template #cell let-row let-col="col">
            @switch (col.key) {
              @case ('cycle') { <df-status-chip kind="cycle" [value]="row.cycle" /> }
              @case ('next') { <span>{{ row.nextBillDate ? (row.nextBillDate | shortDate) : '—' }}</span> }
              @case ('amount') { <span class="font-semibold">{{ row.amount | money: row.currency }}</span> }
              @case ('status') { <df-status-chip kind="subscription" [value]="row.status" /> }
              @default { {{ col.value?.(row) ?? '—' }} }
            }
          </ng-template>
        </df-data-table>
      </div>
    }
  `,
})
export class SubscriptionListPage implements OnInit {
  protected readonly store = inject(BillingStore);
  private readonly router = inject(Router);
  protected readonly empty = EMPTY_STATES['subscriptions'];

  protected readonly columns: ColumnDef<SubscriptionDto>[] = [
    { key: 'customer', header: 'Customer', value: (r) => r.customerName },
    { key: 'plan', header: 'Plan', value: (r) => r.planName },
    { key: 'cycle', header: 'Cycle', width: '8rem' },
    { key: 'next', header: 'Next Bill', width: '8rem' },
    { key: 'amount', header: 'Amount', align: 'right', width: '8rem' },
    { key: 'status', header: 'Status', width: '8rem' },
  ];

  counts() { return this.store.subscriptions()?.counts ?? { active: 0, paused: 0, cancelled: 0 }; }
  items() { return this.store.subscriptions()?.items ?? []; }

  ngOnInit(): void { void this.store.loadSubscriptions(); }
  reload(): void { void this.store.loadSubscriptions(); }
  open(row: SubscriptionDto): void { void this.router.navigate(['/app/subscriptions', row.id]); }
  newPlan(): void { void this.router.navigate(['/admin/plans']); }
}
