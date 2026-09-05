import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CATEGORY_LABEL, CYCLE_LABEL, type PriceListDto, type ProductDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ErrorStateComponent, LoadingComponent, MoneyPipe, StatusChipComponent } from '../../shared/ui';

/** Screen 17 — Product Details: general info, variants and price lists. */
@Component({
  selector: 'df-product-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StatusChipComponent, LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <df-loading [count]="5" label="Loading product" />
    } @else if (error()) {
      <df-error-state [message]="error()!" (retry)="load()" />
    } @else {
      @if (product(); as p) {
      <a routerLink="/admin/products" class="text-sm text-slate-500 hover:text-slate-800">← Products</a>
      <h1 class="df-h1 mt-1">{{ p.name }}</h1>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <df-status-chip kind="category" [value]="p.category" />
        <span class="font-mono text-xs text-slate-400">{{ p.sku }}</span>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2 space-y-6">
          <div class="df-card p-5">
            <h2 class="df-h2">General Info</h2>
            <dl class="mt-4 grid gap-4 sm:grid-cols-2">
              <div><dt class="df-label">Product name</dt><dd class="text-sm text-slate-800">{{ p.name }}</dd></div>
              <div><dt class="df-label">Category</dt><dd class="text-sm text-slate-800">{{ label(p.category) }}</dd></div>
              <div><dt class="df-label">Price</dt><dd class="text-sm font-semibold text-slate-900">{{ p.unitPrice | money }}</dd></div>
              <div><dt class="df-label">Unit</dt><dd class="text-sm text-slate-800">{{ p.unit }}</dd></div>
              <div><dt class="df-label">Tax</dt><dd class="text-sm text-slate-800">{{ p.taxPct }}%</dd></div>
              <div><dt class="df-label">Quantity on hand</dt><dd class="text-sm text-slate-800">{{ p.quantityOnHand }}</dd></div>
              <div class="sm:col-span-2"><dt class="df-label">Description</dt><dd class="text-sm leading-relaxed text-slate-700">{{ p.description || '—' }}</dd></div>
              <div>
                <dt class="df-label">Subscription</dt>
                <dd class="text-sm text-slate-800">{{ p.isSubscription ? 'Yes' : 'No' }}</dd>
              </div>
              @if (p.isSubscription) {
                <div>
                  <dt class="df-label">Recurring</dt>
                  <dd class="text-sm text-slate-800">{{ cycle(p) }}</dd>
                </div>
              }
            </dl>
            @if (p.isSubscription) {
              <p class="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                A recurring order with this product is invoiced at the beginning of the period.
              </p>
            }
          </div>

          <div class="df-card p-5">
            <h2 class="df-h2">Product Variants</h2>
            @if (p.variants.length) {
              <div class="df-scroll-x mt-3">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead><tr><th class="df-th">Attribute</th><th class="df-th">Values</th><th class="df-th text-right">Extra price</th></tr></thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (v of p.variants; track v.attribute) {
                      <tr>
                        <td class="df-td font-medium text-slate-800">{{ v.attribute }}</td>
                        <td class="df-td text-slate-600">{{ values(v) }}</td>
                        <td class="df-td text-right font-mono text-slate-600">{{ extras(v) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="mt-3 text-sm text-slate-500">This product has no variants.</p>
            }
          </div>
        </section>

        <aside>
          <div class="df-card p-5">
            <h2 class="df-h2">Pricelists</h2>
            <div class="df-scroll-x mt-3">
              <table class="min-w-full divide-y divide-slate-200">
                <thead><tr><th class="df-th">Tier</th><th class="df-th">Currency</th><th class="df-th">Price Rule</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (pl of priceLists(); track pl.id) {
                    <tr>
                      <td class="df-td font-medium text-slate-800">{{ pl.name }}</td>
                      <td class="df-td text-slate-600">{{ pl.currencies.join(', ') }}</td>
                      <td class="df-td text-slate-600">{{ rule(pl) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-xs leading-relaxed text-slate-400">
              A tier's price rule sets what the customer pays. It is separate from the tier's <em>discount ceiling</em>, which lives on
              the Discount Tiers &amp; Approvals screen.
            </p>
          </div>
        </aside>
      </div>
      }
    }
  `,
})
export class ProductDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly id = input<string>('');

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly product = signal<ProductDto | null>(null);
  protected readonly priceLists = signal<PriceListDto[]>([]);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [product, priceLists] = await Promise.all([
        firstValueFrom(this.api.get<ProductDto>(`/products/${this.id()}`)),
        firstValueFrom(this.api.get<PriceListDto[]>('/pricelists')),
      ]);
      this.product.set(product);
      this.priceLists.set(priceLists ?? []);
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load this product.');
    } finally {
      this.loading.set(false);
    }
  }

  label(c: string): string { return CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c; }
  cycle(p: ProductDto): string { return p.recurringCycle ? CYCLE_LABEL[p.recurringCycle] : '—'; }
  values(v: ProductDto['variants'][number]): string { return v.values.map((x) => x.value).join(', '); }
  extras(v: ProductDto['variants'][number]): string {
    return v.values.map((x) => (x.extraPrice ? `+$${(x.extraPrice / 100).toFixed(0)}` : '0')).join(', ');
  }
  rule(pl: PriceListDto): string {
    switch (pl.ruleType) {
      case 'PERCENT_OFF_BASE': return `price minus ${pl.ruleValue} percent base`;
      case 'FIXED_PRICE': return 'fixed price';
      default: return 'price, no adjustment';
    }
  }
}
