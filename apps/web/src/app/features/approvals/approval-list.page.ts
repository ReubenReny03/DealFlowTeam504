import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  APPROVAL_SLA_HOURS,
  EMPTY_STATES,
  RISK_LEVEL_LABEL,
  type ApprovalDto,
} from '@dealflow/shared';
import { ApprovalStore } from '../../core/state/feature.stores';
import {
  AgoPipe,
  ColumnDef,
  DataTableComponent,
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingComponent,
  MoneyPipe,
  PaginatorComponent,
  StatusChipComponent,
} from '../../shared/ui';

/** Screen 5 — the approval queue. */
@Component({
  selector: 'df-approval-list',
  standalone: true,
  imports: [
    DataTableComponent,
    LoadingComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    MoneyPipe,
    AgoPipe,
    StatusChipComponent,
    PaginatorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Approvals</h1>
        <p class="df-muted mt-1">
          Quotations only land here when their blended risk score requires a human.
        </p>
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-slate-300"
          [checked]="store.pendingOnly()"
          (change)="togglePending()"
        />
        Pending Only
      </label>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <span class="df-chip border-sky-200 bg-sky-100 text-sky-800"
        >{{ store.counts().pending }} Pending</span
      >
      <span class="df-chip border-amber-200 bg-amber-100 text-amber-800"
        >{{ store.counts().returned }} Returned</span
      >
      <span class="df-chip border-emerald-200 bg-emerald-100 text-emerald-800"
        >{{ store.counts().approved }} Approved</span
      >
      @if (store.counts().rejected > 0) {
        <span class="df-chip border-rose-200 bg-rose-100 text-rose-800"
          >{{ store.counts().rejected }} Rejected</span
        >
      }
    </div>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="4" label="Loading approvals" /></div>
    } @else if (store.error()) {
      <div class="mt-6"><df-error-state [message]="store.error()!" (retry)="reload()" /></div>
    } @else if (store.items().length === 0) {
      <div class="mt-6"><df-empty-state icon="✅" [title]="empty.title" [body]="empty.body" /></div>
    } @else {
      <div class="mt-4">
        <df-data-table
          [columns]="columns"
          [rows]="store.items()"
          [clickable]="true"
          (rowClick)="open($event)"
        >
          <ng-template #cell let-row let-col="col">
            @switch (col.key) {
              @case ('risk') {
                <div class="flex items-center gap-2">
                  <df-status-chip kind="risk" [value]="row.risk.riskLevel" />
                  <span class="font-mono text-xs text-slate-400">{{ row.risk.riskScore }}</span>
                </div>
              }
              @case ('stage') {
                @if (row.currentStage) {
                  <span class="text-slate-700">{{ label(row.currentStage) }}</span>
                } @else {
                  <df-status-chip kind="approval" [value]="row.status" />
                }
              }
              @case ('assigned') {
                <span>{{ row.assignedToName ?? '—' }}</span>
              }
              @case ('amount') {
                <span class="font-semibold">{{ row.amount | money: row.currency }}</span>
              }
              @case ('submitted') {
                <span class="text-slate-500">{{ row.submittedAt | ago }}</span>
                @if (overSla(row)) {
                  <span
                    class="ml-1.5 df-chip border-rose-200 bg-rose-100 text-rose-800"
                    title="Past the {{ slaHours }}h approval SLA"
                    >⚠ over SLA</span
                  >
                }
              }
              @default {
                {{ col.value?.(row) ?? '—' }}
              }
            }
          </ng-template>
        </df-data-table>
        <df-paginator
          [page]="store.page()"
          [pageSize]="store.pageSize()"
          [total]="store.total()"
          (go)="store.goToPage($event)"
        />
      </div>
    }
  `,
})
export class ApprovalListPage implements OnInit {
  protected readonly store = inject(ApprovalStore);
  private readonly router = inject(Router);
  protected readonly empty = EMPTY_STATES['approvals'];

  protected readonly columns: ColumnDef<ApprovalDto>[] = [
    {
      key: 'number',
      header: 'Quotation',
      value: (r) => r.quotationNumber,
      mono: true,
      width: '9rem',
    },
    { key: 'customer', header: 'Customer', value: (r) => r.customerName },
    { key: 'risk', header: 'Blended Risk', width: '11rem' },
    { key: 'stage', header: 'Stage', width: '10rem' },
    { key: 'assigned', header: 'Assigned To', width: '10rem' },
    { key: 'amount', header: 'Amount', align: 'right', width: '9rem' },
    { key: 'submitted', header: 'Submitted', align: 'right', width: '9rem' },
  ];

  protected readonly slaHours = APPROVAL_SLA_HOURS;

  ngOnInit(): void {
    void this.store.load();
  }
  reload(): void {
    void this.store.load();
  }
  togglePending(): void {
    this.store.pendingOnly.update((v) => !v);
    this.store.page.set(1);
    void this.store.load();
  }
  open(row: ApprovalDto): void {
    void this.router.navigate(['/app/approvals', row.id]);
  }
  label(role: string): string {
    return role
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** A pending approval that has sat past the SLA target — surfaces #37 on the queue. */
  overSla(row: ApprovalDto): boolean {
    if (row.status !== 'PENDING' || !row.submittedAt) return false;
    return Date.now() - new Date(row.submittedAt).getTime() > APPROVAL_SLA_HOURS * 3_600_000;
  }

  protected readonly riskLabel = RISK_LEVEL_LABEL;
}
