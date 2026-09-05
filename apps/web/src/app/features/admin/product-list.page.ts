import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  BillingCycle, CATEGORY_LABEL, CYCLE_LABEL, EMPTY_STATES, ProductCategory, money,
  type ProductDashboardDto, type ProductDto, type UpsertProductRequest,
} from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ListQuery } from '../../core/state/list-query';
import { ToastStore } from '../../core/state/toast.store';
import {
  EmptyStateComponent, ErrorStateComponent, KpiTileComponent, LoadingComponent, ModalComponent, MoneyPipe,
  PaginatorComponent, SearchBoxComponent, StatusChipComponent,
} from '../../shared/ui';

/** Screen 16 — Product Dashboard. */
@Component({
  selector: 'df-product-list',
  standalone: true,
  imports: [
    FormsModule, KpiTileComponent, MoneyPipe, StatusChipComponent, LoadingComponent, ErrorStateComponent,
    EmptyStateComponent, ModalComponent, PaginatorComponent, SearchBoxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Products</h1>
        <p class="df-muted mt-1">The catalogue a rep quotes from. A product needs a price and a tax rate before it can be sold.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <df-search-box
          [value]="query.q()"
          placeholder="Search name, SKU or description"
          width="18rem"
          (search)="search($event)"
        />
        <button type="button" class="df-btn-primary" (click)="newProduct()">+ New Product</button>
        <button type="button" class="df-btn-ghost" (click)="managePriceFields()">Manage Price Fields</button>
      </div>
    </div>

    @if (loading()) {
      <div class="mt-6"><df-loading [count]="5" label="Loading catalogue" /></div>
    } @else if (error()) {
      <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div>
    } @else {
      @if (data(); as d) {
      <div class="mt-6 grid gap-4 sm:grid-cols-3">
        <df-kpi-tile label="Total Products" [value]="d.totalActive" [caption]="d.totalActive + ' active, ' + d.totalArchived + ' archived'" />
        <df-kpi-tile label="Pricelists" [value]="d.priceListTiers" [caption]="d.priceListTiers + ' tiers, ' + d.priceListCurrencies + ' currencies'" />
        <df-kpi-tile label="Variants" [value]="d.variantSkuCount" caption="SKUs across the catalogue" />
      </div>

      @if (d.products.length) {
        <div class="df-card df-scroll-x mt-6">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr>
                <th class="df-th">Product name</th><th class="df-th">Category</th><th class="df-th text-right">Variants</th>
                <th class="df-th text-right">Price</th><th class="df-th">Unit</th><th class="df-th text-right">Tax</th><th class="df-th">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (p of d.products; track p.id) {
                <tr class="cursor-pointer transition hover:bg-slate-50" (click)="open(p)">
                  <td class="df-td font-medium text-slate-800">{{ p.name }}</td>
                  <td class="df-td"><df-status-chip kind="category" [value]="p.category" /></td>
                  <td class="df-td text-right font-mono text-slate-500">{{ variantCount(p) }}</td>
                  <td class="df-td text-right font-semibold">
                    {{ p.unitPrice | money }}@if (p.isSubscription) { <span class="text-xs font-normal text-slate-400">/{{ cycleShort(p) }}</span> }
                  </td>
                  <td class="df-td text-slate-600">{{ p.unit }}</td>
                  <td class="df-td text-right font-mono">{{ p.taxPct }}%</td>
                  <td class="df-td">
                    <span class="df-chip" [class]="p.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-100 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-500'">
                      {{ p.status === 'ACTIVE' ? 'Active' : 'Archived' }}
                    </span>
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
      } @else {
        <div class="mt-6">
          <df-empty-state
            icon="📦"
            [title]="empty.title"
            [body]="empty.body"
            [cta]="empty.cta ?? null"
            [filtered]="query.isFiltered()"
            [searchTerm]="query.q()"
            (action)="newProduct()"
            (clearSearch)="search('')"
          />
        </div>
      }
      }
    }

    <df-modal [open]="createOpen()" title="New product" subtitle="A rep can quote it as soon as it is active." (close)="createOpen.set(false)">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="df-label">Product name</span>
          <input class="df-input" [(ngModel)]="draft.name" placeholder="e.g. Standing Desk" />
        </label>
        <label class="block">
          <span class="df-label">Category</span>
          <select class="df-input" [(ngModel)]="draft.category">
            @for (c of categories; track c) { <option [value]="c">{{ categoryLabel[c] }}</option> }
          </select>
        </label>
        <label class="block">
          <span class="df-label">Unit</span>
          <input class="df-input" [(ngModel)]="draft.unit" placeholder="Each" />
        </label>
        <label class="block">
          <span class="df-label">Price (USD)</span>
          <input class="df-input" type="number" min="0" step="0.01" [(ngModel)]="draft.price" />
        </label>
        <label class="block">
          <span class="df-label">Cost (USD)</span>
          <input class="df-input" type="number" min="0" step="0.01" [(ngModel)]="draft.cost" />
          <span class="mt-1 block text-xs text-slate-400">Drives the margin indicator and the upsell ranking.</span>
        </label>
        <label class="block">
          <span class="df-label">Tax %</span>
          <input class="df-input" type="number" min="0" max="100" [(ngModel)]="draft.taxPct" />
        </label>
        <label class="block">
          <span class="df-label">Quantity on hand</span>
          <input class="df-input" type="number" min="0" [(ngModel)]="draft.quantityOnHand" />
        </label>
        <label class="block sm:col-span-2">
          <span class="df-label">Description</span>
          <textarea class="df-input min-h-[4rem]" [(ngModel)]="draft.description"></textarea>
        </label>
        <label class="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" class="h-4 w-4 rounded border-slate-300" [(ngModel)]="draft.isSubscription" />
          <span class="text-sm text-slate-700">This product is sold as a subscription</span>
        </label>
        @if (draft.isSubscription) {
          <label class="block sm:col-span-2">
            <span class="df-label">Recurring</span>
            <select class="df-input" [(ngModel)]="draft.recurringCycle">
              @for (c of cycles; track c) { <option [value]="c">{{ cycleLabel[c] }}</option> }
            </select>
            <span class="mt-1 block text-xs text-slate-400">
              A recurring order with this product is invoiced at the beginning of the period.
            </span>
          </label>
        }
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="df-btn-ghost" (click)="createOpen.set(false)">Cancel</button>
        <button type="button" class="df-btn-primary" [disabled]="saving() || !draft.name.trim()" (click)="create()">
          {{ saving() ? 'Creating…' : 'Create product' }}
        </button>
      </div>
    </df-modal>
  `,
})
export class ProductListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastStore);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly data = signal<ProductDashboardDto | null>(null);
  protected readonly empty = EMPTY_STATES['products'];
  /** The tiles count the whole catalogue; this pages and searches the table under them. */
  protected readonly query = new ListQuery(25);
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly cycleLabel = CYCLE_LABEL;
  protected readonly categories = Object.values(ProductCategory);
  protected readonly cycles = Object.values(BillingCycle);

  protected readonly createOpen = signal(false);
  protected readonly saving = signal(false);
  draft = emptyDraft();

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data, meta } = await firstValueFrom(
        this.api.getWithMeta<ProductDashboardDto>('/products/dashboard', this.query.params()),
      );
      this.data.set(data);
      this.query.applyMeta(meta, data.products.length);
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load the catalogue.');
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

  variantCount(p: ProductDto): string {
    if (!p.variants?.length) return '—';
    const skus = p.variants.reduce((n, v) => n * Math.max(1, v.values.length), 1);
    return `${skus} SKUs`;
  }
  cycleShort(p: ProductDto): string {
    return { WEEKLY: 'week', MONTHLY: 'month', QUARTERLY: 'quarter', YEARLY: 'year' }[p.recurringCycle ?? 'MONTHLY'];
  }

  open(p: ProductDto): void { void this.router.navigate(['/admin/products', p.id]); }
  managePriceFields(): void { void this.router.navigate(['/admin/pricelists']); }

  newProduct(): void {
    this.draft = emptyDraft();
    this.createOpen.set(true);
  }

  /** Money leaves this form as an integer count of cents — never a float. */
  async create(): Promise<void> {
    const body: UpsertProductRequest = {
      name: this.draft.name.trim(),
      category: this.draft.category,
      description: this.draft.description.trim(),
      unitPrice: money(Number(this.draft.price) || 0),
      costPrice: money(Number(this.draft.cost) || 0),
      unit: this.draft.unit.trim() || 'Each',
      taxPct: Number(this.draft.taxPct) || 0,
      isSubscription: this.draft.isSubscription,
      recurringCycle: this.draft.isSubscription ? this.draft.recurringCycle : undefined,
      quantityOnHand: Number(this.draft.quantityOnHand) || 0,
    };
    this.saving.set(true);
    try {
      const product = await firstValueFrom(this.api.post<ProductDto>('/products', body));
      this.createOpen.set(false);
      this.toast.success('Product created', `${product.name} (${product.sku}) is in the catalogue.`);
      await this.router.navigate(['/admin/products', product.id]);
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.saving.set(false);
    }
  }
}

/** The create form's working copy. Prices are majors here and cents on the wire. */
function emptyDraft() {
  return {
    name: '',
    category: ProductCategory.HARDWARE as ProductCategory,
    description: '',
    price: 0,
    cost: 0,
    unit: 'Each',
    taxPct: 15,
    quantityOnHand: 0,
    isSubscription: false,
    recurringCycle: BillingCycle.MONTHLY as BillingCycle,
  };
}
