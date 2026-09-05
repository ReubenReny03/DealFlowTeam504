import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CATEGORY_LABEL, EMPTY_STATES, type ProductDashboardDto, type ProductDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ToastStore } from '../../core/state/toast.store';
import {
  EmptyStateComponent, ErrorStateComponent, KpiTileComponent, LoadingComponent, MoneyPipe, StatusChipComponent,
} from '../../shared/ui';

/** Screen 16 — Product Dashboard. */
@Component({
  selector: 'df-product-list',
  standalone: true,
  imports: [KpiTileComponent, MoneyPipe, StatusChipComponent, LoadingComponent, ErrorStateComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Products</h1>
        <p class="df-muted mt-1">The catalogue a rep quotes from. A product needs a price and a tax rate before it can be sold.</p>
      </div>
      <div class="flex gap-2">
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
      } @else {
        <div class="mt-6"><df-empty-state icon="📦" [title]="empty.title" [body]="empty.body" [cta]="empty.cta ?? null" (action)="newProduct()" /></div>
      }
      }
    }
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
  protected readonly categoryLabel = CATEGORY_LABEL;

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await firstValueFrom(this.api.get<ProductDashboardDto>('/products/dashboard')));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load the catalogue.');
    } finally {
      this.loading.set(false);
    }
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
  newProduct(): void { this.toast.info('+ New Product', 'The product editor is Agent A, task A-9 in docs/AGENT_A.md.'); }
  managePriceFields(): void { void this.router.navigate(['/admin/pricelists']); }
}
