import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  EMPTY_STATES, TIER_LABEL, type CustomerDto, type KanbanBoardDto, type QuotationDto, type QuotationSummaryDto,
} from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ToastStore } from '../../core/state/toast.store';
import {
  AgoPipe, ColumnDef, DataTableComponent, EmptyStateComponent, ErrorStateComponent,
  KanbanBoardComponent, LoadingComponent, ModalComponent, MoneyPipe, StatusChipComponent,
} from '../../shared/ui';

/** Screen 3 — Quotations, as a Kanban pipeline or a flat table. */
@Component({
  selector: 'df-quotation-list',
  standalone: true,
  imports: [
    FormsModule, KanbanBoardComponent, DataTableComponent, LoadingComponent, ErrorStateComponent,
    EmptyStateComponent, ModalComponent, MoneyPipe, AgoPipe, StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Quotations</h1>
        <p class="df-muted mt-1">Every open deal, grouped by where it is in the flow.</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="df-btn-ghost" (click)="toggleView()">
          {{ view() === 'kanban' ? 'Switch to Table View' : 'Switch to Kanban View' }}
        </button>
        <button type="button" class="df-btn-primary" (click)="create()">+ New Quotation</button>
      </div>
    </div>

    @if (loading()) {
      <div class="mt-6"><df-loading [count]="5" label="Loading quotations" /></div>
    } @else if (error()) {
      <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div>
    } @else if (isEmpty()) {
      <div class="mt-6">
        <df-empty-state [title]="empty.title" [body]="empty.body" [cta]="empty.cta ?? null" (action)="create()" />
      </div>
    } @else if (view() === 'kanban') {
      <div class="mt-6"><df-kanban-board [board]="board()!" (cardClick)="open($event)" /></div>
    } @else {
      <div class="mt-6">
        <df-data-table [columns]="columns" [rows]="rows()" [clickable]="true" (rowClick)="open($event)">
          <ng-template #cell let-row let-col="col">
            @switch (col.key) {
              @case ('stage') { <df-status-chip kind="stage" [value]="row.stage" /> }
              @case ('tier') { <df-status-chip kind="tier" [value]="row.tier" /> }
              @case ('risk') {
                @if (row.riskScore > 0) { <df-status-chip kind="risk" [value]="row.riskLevel" [text]="row.riskLevel + ' · ' + row.riskScore" /> }
                @else { <span class="text-xs text-emerald-600">Within limits</span> }
              }
              @case ('total') { <span class="font-semibold">{{ row.grandTotal | money: row.currency }}</span> }
              @case ('activity') { <span class="text-slate-500">{{ row.lastActivityAt | ago }}</span> }
              @default { {{ col.value?.(row) ?? '—' }} }
            }
          </ng-template>
        </df-data-table>
      </div>
    }

    <df-modal [open]="pickerOpen()" title="New quotation" subtitle="Their tier and price list come with them." (close)="pickerOpen.set(false)">
      @if (customersLoading()) {
        <df-loading [count]="3" label="Loading customers" />
      } @else if (customers().length) {
        <label class="block">
          <span class="df-label">Customer</span>
          <select class="df-input" [(ngModel)]="pickedCustomerId">
            @for (c of customers(); track c.id) {
              <option [value]="c.id">{{ c.name }} — {{ tierLabel[c.tier] }}</option>
            }
          </select>
        </label>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="df-btn-ghost" (click)="pickerOpen.set(false)">Cancel</button>
          <button type="button" class="df-btn-primary" [disabled]="!pickedCustomerId || creating()" (click)="confirmCreate()">
            {{ creating() ? 'Creating…' : 'Create quotation' }}
          </button>
        </div>
      } @else {
        <p class="text-sm text-slate-600">No customers are configured yet. An admin needs to add one first.</p>
      }
    </df-modal>
  `,
})
export class QuotationListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastStore);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly board = signal<KanbanBoardDto | null>(null);
  protected readonly view = signal<'kanban' | 'table'>('kanban');
  protected readonly empty = EMPTY_STATES['quotations'];
  protected readonly tierLabel = TIER_LABEL;

  protected readonly pickerOpen = signal(false);
  protected readonly customersLoading = signal(false);
  protected readonly creating = signal(false);
  protected readonly customers = signal<CustomerDto[]>([]);
  pickedCustomerId = '';

  protected readonly columns: ColumnDef<QuotationSummaryDto>[] = [
    { key: 'number', header: 'Quotation', value: (r) => r.number, mono: true, width: '9rem' },
    { key: 'customer', header: 'Customer', value: (r) => r.customerName },
    { key: 'tier', header: 'Tier', width: '7rem' },
    { key: 'owner', header: 'Owner', value: (r) => r.ownerName, width: '9rem' },
    { key: 'stage', header: 'Stage', width: '10rem' },
    { key: 'risk', header: 'Blended Risk', width: '11rem' },
    { key: 'total', header: 'Amount', align: 'right', width: '9rem' },
    { key: 'activity', header: 'Last activity', align: 'right', width: '9rem' },
  ];

  rows(): QuotationSummaryDto[] {
    return (this.board()?.columns ?? []).flatMap((c) => c.cards);
  }

  isEmpty(): boolean {
    return !this.loading() && this.rows().length === 0;
  }

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.board.set(await firstValueFrom(this.api.get<KanbanBoardDto>('/quotations/board')));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load quotations.');
    } finally {
      this.loading.set(false);
    }
  }

  toggleView(): void { this.view.update((v) => (v === 'kanban' ? 'table' : 'kanban')); }
  open(card: QuotationSummaryDto): void { void this.router.navigate(['/app/quotations', card.id]); }

  async create(): Promise<void> {
    this.pickedCustomerId = '';
    this.pickerOpen.set(true);
    if (this.customers().length) return;
    this.customersLoading.set(true);
    try {
      this.customers.set(await firstValueFrom(this.api.get<CustomerDto[]>('/customers', { pageSize: 200 })));
    } catch {
      this.customers.set([]);
    } finally {
      this.customersLoading.set(false);
    }
  }

  async confirmCreate(): Promise<void> {
    if (!this.pickedCustomerId) return;
    this.creating.set(true);
    try {
      const quotation = await firstValueFrom(
        this.api.post<QuotationDto>('/quotations', { customerId: this.pickedCustomerId }),
      );
      this.pickerOpen.set(false);
      this.toast.success('Quotation created', `${quotation.number} for ${quotation.customerName} — add lines to get started.`);
      await this.router.navigate(['/app/quotations', quotation.id]);
    } catch {
      /* the interceptor already toasted the reason */
    } finally {
      this.creating.set(false);
    }
  }
}
