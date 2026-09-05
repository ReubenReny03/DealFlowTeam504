import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { EMPTY_STATES, money, toMajor, type UpsertWarehouseRequest, type WarehouseDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ListQuery } from '../../core/state/list-query';
import { ToastStore } from '../../core/state/toast.store';
import {
  EmptyStateComponent, ErrorStateComponent, LoadingComponent, ModalComponent, MoneyPipe,
  PaginatorComponent, SearchBoxComponent,
} from '../../shared/ui';

/** Warehouse setup: the numbers the split planner actually ranks on. */
@Component({
  selector: 'df-warehouses',
  standalone: true,
  imports: [
    FormsModule, LoadingComponent, ErrorStateComponent, EmptyStateComponent, ModalComponent, MoneyPipe,
    PaginatorComponent, SearchBoxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Warehouses</h1>
        <p class="df-muted mt-1">The split planner prefers the lowest shipping cost weight, and estimates cost as base + per-unit × quantity.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <df-search-box [value]="query.q()" placeholder="Search name or code" (search)="search($event)" />
        <button type="button" class="df-btn-primary" (click)="create()">+ New Warehouse</button>
      </div>
    </div>

    @if (loading()) { <div class="mt-6"><df-loading [count]="2" label="Loading warehouses" /></div> }
    @else if (error()) { <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div> }
    @else if (!warehouses().length) {
      <div class="mt-6">
        <df-empty-state
          [title]="empty.title"
          [body]="empty.body"
          [cta]="empty.cta ?? null"
          [filtered]="query.isFiltered()"
          [searchTerm]="query.q()"
          (action)="create()"
          (clearSearch)="search('')"
        />
      </div>
    }
    @else {
      <div class="df-card df-scroll-x mt-6">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="df-th">Warehouse</th><th class="df-th">Code</th>
              <th class="df-th text-right">Shipping weight</th><th class="df-th text-right">Base shipment</th>
              <th class="df-th text-right">Per unit</th><th class="df-th text-right">Lead time</th>
              <th class="df-th text-right">Reorder point</th><th class="df-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (w of warehouses(); track w.id) {
              <tr>
                <td class="df-td font-medium text-slate-800">{{ w.name }}</td>
                <td class="df-td font-mono text-slate-500">{{ w.code }}</td>
                <td class="df-td text-right font-mono">{{ w.shippingCostWeight }}</td>
                <td class="df-td text-right font-mono">{{ w.baseShipmentCost | money }}</td>
                <td class="df-td text-right font-mono">{{ w.perUnitShippingCost | money }}</td>
                <td class="df-td text-right font-mono">{{ w.replenishmentRule.leadTimeDays }} days</td>
                <td class="df-td text-right font-mono">{{ w.replenishmentRule.reorderPoint }}</td>
                <td class="df-td text-right">
                  <button type="button" class="text-sm font-medium text-brand-700 hover:text-brand-800" (click)="edit(w)">Edit</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <df-paginator
        [page]="query.page()"
        [pageSize]="query.pageSize()"
        [total]="query.total()"
        (go)="goToPage($event)"
      />
      <p class="mt-3 text-xs leading-relaxed text-slate-400">
        A new warehouse takes part in the split planner as soon as it holds stock. Lead time is what a backorder ETA is estimated from.
      </p>

      <df-modal
        [open]="formOpen()"
        [title]="editingId() ? 'Edit warehouse' : 'New warehouse'"
        subtitle="Ranking weight and cost estimation are deliberately separate numbers."
        (close)="close()"
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="df-label">Warehouse name</span>
            <input class="df-input" [(ngModel)]="draft.name" placeholder="e.g. North Hub" />
          </label>
          <label class="block">
            <span class="df-label">Code</span>
            <input class="df-input font-mono" [(ngModel)]="draft.code" placeholder="Derived from the name if left blank" />
          </label>
          <label class="block">
            <span class="df-label">Shipping cost weight</span>
            <input class="df-input" type="number" min="0.1" step="0.1" [(ngModel)]="draft.shippingCostWeight" />
            <span class="mt-1 block text-xs text-slate-400">Ranking only. Lower is preferred.</span>
          </label>
          <label class="block">
            <span class="df-label">Base shipment cost (USD)</span>
            <input class="df-input" type="number" min="0" step="0.01" [(ngModel)]="draft.baseShipmentCost" />
          </label>
          <label class="block">
            <span class="df-label">Per-unit cost (USD)</span>
            <input class="df-input" type="number" min="0" step="0.01" [(ngModel)]="draft.perUnitShippingCost" />
          </label>
          <label class="block">
            <span class="df-label">Lead time (days)</span>
            <input class="df-input" type="number" min="0" [(ngModel)]="draft.leadTimeDays" />
          </label>
          <label class="block">
            <span class="df-label">Reorder point</span>
            <input class="df-input" type="number" min="0" [(ngModel)]="draft.reorderPoint" />
          </label>
          <label class="block">
            <span class="df-label">Reorder quantity</span>
            <input class="df-input" type="number" min="0" [(ngModel)]="draft.reorderQty" />
          </label>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="df-btn-ghost" (click)="close()">Cancel</button>
          <button type="button" class="df-btn-primary" [disabled]="saving() || !draft.name.trim()" (click)="save()">
            {{ saving() ? 'Saving…' : (editingId() ? 'Save warehouse' : 'Create warehouse') }}
          </button>
        </div>
      </df-modal>
    }
  `,
})
export class WarehousesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastStore);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly warehouses = signal<WarehouseDto[]>([]);
  protected readonly empty = EMPTY_STATES['warehouses'];
  protected readonly query = new ListQuery(25);

  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);

  draft = emptyDraft();

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try {
      const { data, meta } = await firstValueFrom(
        this.api.getWithMeta<WarehouseDto[]>('/warehouses', this.query.params()),
      );
      this.warehouses.set(data);
      this.query.applyMeta(meta, data.length);
    }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load warehouses.'); }
    finally { this.loading.set(false); }
  }

  search(term: string): void {
    if (this.query.setSearch(term)) void this.load();
  }

  goToPage(page: number): void {
    if (this.query.goToPage(page)) void this.load();
  }

  create(): void {
    this.draft = emptyDraft();
    this.editingId.set(null);
    this.formOpen.set(true);
  }

  edit(w: WarehouseDto): void {
    this.draft = {
      name: w.name,
      code: w.code,
      shippingCostWeight: w.shippingCostWeight,
      baseShipmentCost: toMajor(w.baseShipmentCost),
      perUnitShippingCost: toMajor(w.perUnitShippingCost),
      leadTimeDays: w.replenishmentRule.leadTimeDays,
      reorderPoint: w.replenishmentRule.reorderPoint,
      reorderQty: w.replenishmentRule.reorderQty,
    };
    this.editingId.set(w.id);
    this.formOpen.set(true);
  }

  close(): void { this.formOpen.set(false); }

  async save(): Promise<void> {
    const body: UpsertWarehouseRequest = {
      name: this.draft.name.trim(),
      code: this.draft.code.trim() || undefined,
      shippingCostWeight: Number(this.draft.shippingCostWeight) || 1,
      baseShipmentCost: money(Number(this.draft.baseShipmentCost) || 0),
      perUnitShippingCost: money(Number(this.draft.perUnitShippingCost) || 0),
      replenishmentRule: {
        leadTimeDays: Number(this.draft.leadTimeDays) || 0,
        reorderPoint: Number(this.draft.reorderPoint) || 0,
        reorderQty: Number(this.draft.reorderQty) || 0,
      },
    };
    const id = this.editingId();
    this.saving.set(true);
    try {
      const saved = id
        ? await firstValueFrom(this.api.put<WarehouseDto>(`/warehouses/${id}`, body))
        : await firstValueFrom(this.api.post<WarehouseDto>('/warehouses', body));
      this.close();
      this.toast.success(id ? 'Warehouse saved' : 'Warehouse created', `${saved.name} (${saved.code}) is in the split planner.`);
      await this.load();
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.saving.set(false);
    }
  }
}

/** Costs are majors in the form and integer cents on the wire. */
function emptyDraft() {
  return {
    name: '', code: '', shippingCostWeight: 1,
    baseShipmentCost: 0, perUnitShippingCost: 0,
    leadTimeDays: 7, reorderPoint: 10, reorderQty: 50,
  };
}
