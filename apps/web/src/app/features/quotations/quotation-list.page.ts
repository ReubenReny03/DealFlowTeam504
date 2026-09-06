import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  EMPTY_STATES, QUOTATION_WRITE_ROLES, Role, TIER_LABEL,
  type CustomerDto, type KanbanBoardDto, type QuotationDto, type QuotationSummaryDto,
} from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ListQuery } from '../../core/state/list-query';
import { SessionStore } from '../../core/state/session.store';
import { ToastStore } from '../../core/state/toast.store';
import {
  AgoPipe, ColumnDef, DataTableComponent, EmptyStateComponent, ErrorStateComponent,
  KanbanBoardComponent, LoadingComponent, ModalComponent, MoneyPipe, PaginatorComponent,
  SearchBoxComponent, StatusChipComponent,
} from '../../shared/ui';

/**
 * The flat list returns full `QuotationDto`s while the board returns cards; this
 * narrows one to the other so both views feed the same table columns.
 */
function toSummary(q: QuotationDto): QuotationSummaryDto {
  return {
    id: q.id,
    number: q.number,
    customerName: q.customerName,
    tier: q.tier,
    ownerName: q.ownerName,
    stage: q.stage,
    grandTotal: q.totals.grandTotal,
    currency: q.currency,
    riskLevel: q.risk.riskLevel,
    riskScore: q.risk.riskScore,
    lastActivityAt: q.lastActivityAt,
    updatedAt: q.updatedAt,
    lineCount: q.lines.length,
  };
}

/** Screen 3 — Quotations, as a Kanban pipeline or a flat table. */
@Component({
  selector: 'df-quotation-list',
  standalone: true,
  imports: [
    FormsModule, KanbanBoardComponent, DataTableComponent, LoadingComponent, ErrorStateComponent,
    EmptyStateComponent, ModalComponent, MoneyPipe, AgoPipe, StatusChipComponent,
    PaginatorComponent, SearchBoxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Quotations</h1>
        @if (financeScoped()) {
          <p class="df-muted mt-1">
            The deals that cleared approval — approved, in negotiation, or confirmed. Drafts and
            quotes still awaiting a Sales Manager are not yours to work.
          </p>
        } @else {
          <p class="df-muted mt-1">Every open deal, grouped by where it is in the flow.</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <!-- One term, both views: the board and the table take the same ?q=. -->
        <df-search-box
          [value]="query.q()"
          placeholder="Search quotation, customer or owner"
          width="18rem"
          (search)="search($event)"
        />
        <button type="button" class="df-btn-ghost" (click)="toggleView()">
          {{ view() === 'kanban' ? 'Switch to Table View' : 'Switch to Kanban View' }}
        </button>
        @if (canCreate()) {
          <button type="button" class="df-btn-primary" (click)="create()">+ New Quotation</button>
        }
      </div>
    </div>

    @if (loading()) {
      <div class="mt-6"><df-loading [count]="5" label="Loading quotations" /></div>
    } @else if (error()) {
      <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div>
    } @else if (isEmpty()) {
      <div class="mt-6">
        <df-empty-state
          [title]="empty.title"
          [body]="empty.body"
          [cta]="canCreate() ? (empty.cta ?? null) : null"
          [filtered]="query.isFiltered()"
          [searchTerm]="query.q()"
          (action)="create()"
          (clearSearch)="search('')"
        />
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
        <df-paginator
          [page]="query.page()"
          [pageSize]="query.pageSize()"
          [total]="query.total()"
          (go)="goToPage($event)"
        />
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
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastStore);

  /**
   * Finance is served a narrower list by the API, so the page says so rather than
   * claiming to show "every open deal" while showing a subset of them.
   */
  protected readonly financeScoped = computed(() => this.session.role() === Role.FINANCE);
  /** No "+ New Quotation" for a role the API would 403 — Finance reviews, never raises. */
  protected readonly canCreate = computed(() => {
    const role = this.session.role();
    return !!role && QUOTATION_WRITE_ROLES.includes(role);
  });

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly board = signal<KanbanBoardDto | null>(null);
  protected readonly tableRows = signal<QuotationSummaryDto[]>([]);
  protected readonly view = signal<'kanban' | 'table'>('kanban');
  protected readonly empty = EMPTY_STATES['quotations'];
  protected readonly tierLabel = TIER_LABEL;

  /**
   * Search and paging for the TABLE view. The board takes the same `q` but is
   * grouped by stage rather than paged, so only the table carries page state.
   */
  protected readonly query = new ListQuery(25);

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
    return this.tableRows();
  }

  isEmpty(): boolean {
    if (this.loading()) return false;
    return this.view() === 'kanban'
      ? (this.board()?.columns ?? []).every((c) => c.cardCount === 0)
      : this.tableRows().length === 0;
  }

  ngOnInit(): void { void this.load(); }

  /**
   * Loads whichever view is showing. The table is paged server-side — the full
   * seeded quotation set must never arrive in one response — while the board
   * fetches its stage columns with the same search term applied.
   */
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.view() === 'kanban') {
        this.board.set(
          await firstValueFrom(
            this.api.get<KanbanBoardDto>('/quotations/board', { q: this.query.q() || undefined }),
          ),
        );
      } else {
        const { data, meta } = await firstValueFrom(
          this.api.getWithMeta<QuotationDto[]>('/quotations', this.query.params()),
        );
        this.tableRows.set(data.map(toSummary));
        this.query.applyMeta(meta, data.length);
      }
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load quotations.');
    } finally {
      this.loading.set(false);
    }
  }

  search(term: string): void {
    if (this.query.setSearch(term)) void this.load();
  }

  goToPage(page: number): void {
    if (this.query.goToPage(page)) void this.load();
  }

  /** Switching views keeps the search term; it just re-fetches in the other shape. */
  toggleView(): void {
    this.view.update((v) => (v === 'kanban' ? 'table' : 'kanban'));
    this.query.page.set(1);
    void this.load();
  }
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
