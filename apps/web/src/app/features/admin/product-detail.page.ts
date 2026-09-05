import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  BillingCycle,
  CATEGORY_LABEL,
  CYCLE_LABEL,
  ProductCategory,
  ProductStatus,
  money,
  toMajor,
  type PriceListDto,
  type ProductDto,
  type UpsertProductRequest,
} from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ToastStore } from '../../core/state/toast.store';
import { ErrorStateComponent, LoadingComponent, MoneyPipe, StatusChipComponent } from '../../shared/ui';

interface VariantDraft {
  attribute: string;
  /** Comma-separated in the editor: "4GB, 8GB". */
  values: string;
  /** Comma-separated majors, positionally matched to `values`: "0, 30". */
  extras: string;
}

/** Screen 17 — Product Details: general info, variants and price lists. */
@Component({
  selector: 'df-product-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, MoneyPipe, StatusChipComponent, LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <df-loading [count]="5" label="Loading product" />
    } @else if (error()) {
      <df-error-state [message]="error()!" (retry)="load()" />
    } @else {
      @if (product(); as p) {
      <a routerLink="/admin/products" class="text-sm text-slate-500 hover:text-slate-800">← Products</a>
      <div class="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="df-h1">{{ p.name }}</h1>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <df-status-chip kind="category" [value]="p.category" />
            <span class="font-mono text-xs text-slate-400">{{ p.sku }}</span>
          </div>
        </div>
        @if (editing()) {
          <div class="flex gap-2">
            <button type="button" class="df-btn-ghost" (click)="cancelEdit()">Discard changes</button>
            <button type="button" class="df-btn-primary" [disabled]="saving() || !form.name.trim()" (click)="save()">
              {{ saving() ? 'Saving…' : 'Save product' }}
            </button>
          </div>
        } @else {
          <button type="button" class="df-btn-primary" (click)="startEdit(p)">Edit product</button>
        }
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2 space-y-6">
          <div class="df-card p-5">
            <h2 class="df-h2">General Info</h2>

            @if (editing()) {
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <label class="block sm:col-span-2">
                  <span class="df-label">Product name</span>
                  <input class="df-input" [(ngModel)]="form.name" />
                </label>
                <label class="block">
                  <span class="df-label">SKU</span>
                  <input class="df-input font-mono" [(ngModel)]="form.sku" />
                </label>
                <label class="block">
                  <span class="df-label">Category</span>
                  <select class="df-input" [(ngModel)]="form.category">
                    @for (c of categories; track c) { <option [value]="c">{{ categoryLabel[c] }}</option> }
                  </select>
                </label>
                <label class="block">
                  <span class="df-label">Price (USD)</span>
                  <input class="df-input" type="number" min="0" step="0.01" [(ngModel)]="form.price" />
                </label>
                <label class="block">
                  <span class="df-label">Cost (USD)</span>
                  <input class="df-input" type="number" min="0" step="0.01" [(ngModel)]="form.cost" />
                </label>
                <label class="block">
                  <span class="df-label">Unit</span>
                  <input class="df-input" [(ngModel)]="form.unit" />
                </label>
                <label class="block">
                  <span class="df-label">Tax %</span>
                  <input class="df-input" type="number" min="0" max="100" [(ngModel)]="form.taxPct" />
                </label>
                <label class="block">
                  <span class="df-label">Quantity on hand</span>
                  <input class="df-input" type="number" min="0" [(ngModel)]="form.quantityOnHand" />
                  <span class="mt-1 block text-xs text-slate-400">Catalogue-level. Per-warehouse stock is the authoritative figure.</span>
                </label>
                <label class="block">
                  <span class="df-label">Status</span>
                  <select class="df-input" [(ngModel)]="form.status">
                    @for (s of statuses; track s) { <option [value]="s">{{ s === 'ACTIVE' ? 'Active' : 'Archived' }}</option> }
                  </select>
                </label>
                <label class="block sm:col-span-2">
                  <span class="df-label">Description</span>
                  <textarea class="df-input min-h-[4.5rem]" [(ngModel)]="form.description"></textarea>
                </label>
                <label class="flex items-center gap-2">
                  <input type="checkbox" class="h-4 w-4 rounded border-slate-300" [(ngModel)]="form.isSubscription" />
                  <span class="text-sm text-slate-700">Subscription</span>
                </label>
                @if (form.isSubscription) {
                  <label class="block">
                    <span class="df-label">Recurring</span>
                    <select class="df-input" [(ngModel)]="form.recurringCycle">
                      @for (c of cycles; track c) { <option [value]="c">{{ cycleLabel[c] }}</option> }
                    </select>
                  </label>
                }
              </div>
            } @else {
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
            }

            @if (showsRecurringNote()) {
              <p class="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                A recurring order with this product is invoiced at the beginning of the period.
              </p>
            }
          </div>

          <div class="df-card p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="df-h2">Product Variants</h2>
              @if (editing()) {
                <button type="button" class="df-btn-ghost" (click)="addVariant()">+ Add attribute</button>
              }
            </div>

            @if (editing()) {
              @if (variants().length) {
                <div class="df-scroll-x mt-3">
                  <table class="min-w-full divide-y divide-slate-200">
                    <thead>
                      <tr>
                        <th class="df-th">Attribute</th><th class="df-th">Values</th>
                        <th class="df-th">Extra price (USD)</th><th class="df-th"></th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      @for (v of variants(); track $index) {
                        <tr>
                          <td class="df-td"><input class="df-input !w-32" [(ngModel)]="v.attribute" placeholder="RAM" /></td>
                          <td class="df-td"><input class="df-input" [(ngModel)]="v.values" placeholder="4GB, 8GB" /></td>
                          <td class="df-td"><input class="df-input !w-32" [(ngModel)]="v.extras" placeholder="0, 30" /></td>
                          <td class="df-td text-right">
                            <button type="button" class="text-slate-400 hover:text-rose-600" aria-label="Remove attribute" (click)="removeVariant($index)">✕</button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="mt-3 text-xs leading-relaxed text-slate-400">
                  Values and extra prices are comma-separated and matched in order — <code>4GB, 8GB</code> with <code>0, 30</code> means
                  8GB costs $30 more. Every combination counts as one SKU on the Products dashboard.
                </p>
              } @else {
                <p class="mt-3 text-sm text-slate-500">No variants yet. Add an attribute such as RAM, Colour or Manufacturer.</p>
              }
            } @else {
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
            <a routerLink="/admin/pricelists" class="mt-3 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
              Edit price rules →
            </a>
          </div>
        </aside>
      </div>
      }
    }
  `,
})
export class ProductDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastStore);
  readonly id = input<string>('');

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly product = signal<ProductDto | null>(null);
  protected readonly priceLists = signal<PriceListDto[]>([]);

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly variants = signal<VariantDraft[]>([]);

  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly cycleLabel = CYCLE_LABEL;
  protected readonly categories = Object.values(ProductCategory);
  protected readonly cycles = Object.values(BillingCycle);
  protected readonly statuses = Object.values(ProductStatus);

  form = {
    name: '', sku: '', category: ProductCategory.HARDWARE as ProductCategory, description: '',
    price: 0, cost: 0, unit: 'Each', taxPct: 15, quantityOnHand: 0,
    isSubscription: false, recurringCycle: BillingCycle.MONTHLY as BillingCycle,
    status: ProductStatus.ACTIVE as ProductStatus,
  };

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

  /* ------------------------------------------------------------------ editing */

  startEdit(p: ProductDto): void {
    this.form = {
      name: p.name,
      sku: p.sku,
      category: p.category,
      description: p.description ?? '',
      price: toMajor(p.unitPrice),
      cost: toMajor(p.costPrice),
      unit: p.unit,
      taxPct: p.taxPct,
      quantityOnHand: p.quantityOnHand,
      isSubscription: p.isSubscription,
      recurringCycle: p.recurringCycle ?? BillingCycle.MONTHLY,
      status: p.status,
    };
    this.variants.set(
      p.variants.map((v) => ({
        attribute: v.attribute,
        values: v.values.map((x) => x.value).join(', '),
        extras: v.values.map((x) => String(toMajor(x.extraPrice))).join(', '),
      })),
    );
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.variants.set([]);
  }

  addVariant(): void {
    this.variants.update((list) => [...list, { attribute: '', values: '', extras: '' }]);
  }

  removeVariant(index: number): void {
    this.variants.update((list) => list.filter((_, i) => i !== index));
  }

  /** The note belongs under whichever view is showing a subscription product. */
  showsRecurringNote(): boolean {
    return this.editing() ? this.form.isSubscription : !!this.product()?.isSubscription;
  }

  async save(): Promise<void> {
    const body: UpsertProductRequest = {
      name: this.form.name.trim(),
      sku: this.form.sku.trim(),
      category: this.form.category,
      description: this.form.description.trim(),
      unitPrice: money(Number(this.form.price) || 0),
      costPrice: money(Number(this.form.cost) || 0),
      unit: this.form.unit.trim() || 'Each',
      taxPct: Number(this.form.taxPct) || 0,
      isSubscription: this.form.isSubscription,
      recurringCycle: this.form.isSubscription ? this.form.recurringCycle : undefined,
      quantityOnHand: Number(this.form.quantityOnHand) || 0,
      status: this.form.status,
      variants: this.buildVariants(),
    };

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.api.put<ProductDto>(`/products/${this.id()}`, body));
      this.product.set(saved);
      this.editing.set(false);
      this.variants.set([]);
      this.toast.success('Product saved', `${saved.name} is up to date.`);
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.saving.set(false);
    }
  }

  /** "4GB, 8GB" + "0, 30" -> [{value: '4GB', extraPrice: 0}, {value: '8GB', extraPrice: 3000}]. */
  private buildVariants(): ProductDto['variants'] {
    return this.variants()
      .map((v) => {
        const extras = v.extras.split(',').map((x) => Number(x.trim()) || 0);
        return {
          attribute: v.attribute.trim(),
          values: v.values
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value, i) => ({ value, extraPrice: money(extras[i] ?? 0) })),
        };
      })
      .filter((v) => v.attribute && v.values.length > 0);
  }

  /* ------------------------------------------------------------------ display */

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
