/**
 * The catalogue from screens 16 and 17, plus the co-purchase pairings the upsell
 * panel ranks on.
 *
 * For a HARDWARE product, `quantityOnHand` is the sum of what the warehouses
 * hold in `warehouses.seed.ts` — screen 17's Warehouse Stock card reconciles the
 * two and says so when they drift, so seeded data must not start out drifted.
 * SERVICES and SUBSCRIPTION products are never stocked and stay at 0.
 */
import { BillingCycle, ProductCategory, ProductStatus, money } from '@dealflow/shared';
import { Product, ProductPairing } from '../../db/models.js';
import { IDS } from '../ids.js';
import type { SeedContext } from '../context.js';

export async function seedProducts(_ctx: SeedContext): Promise<void> {
  await Product.insertMany([
    {
      _id: IDS.products.laptop, sku: 'LP14-BASE', name: 'Laptop Pro 14',
      category: ProductCategory.HARDWARE,
      description: '14-inch business laptop. Three configurable SKUs.',
      unitPrice: money(1200), costPrice: money(820), unit: 'Each', taxPct: 15,
      isSubscription: false, quantityOnHand: 50, status: ProductStatus.ACTIVE, promoted: false,
      // Screen 17's variant table, verbatim.
      variants: [
        { attribute: 'Color', values: [{ value: 'Blue', extraPrice: 0 }, { value: 'Black', extraPrice: 0 }] },
        { attribute: 'RAM', values: [{ value: '4GB', extraPrice: 0 }, { value: '8GB', extraPrice: money(30) }] },
        { attribute: 'Manufacturer', values: [{ value: 'Dell', extraPrice: money(10) }, { value: 'HP', extraPrice: money(30) }] },
      ],
    },
    {
      _id: IDS.products.setup, sku: 'SVC-ONSITE', name: 'Onsite Setup Service',
      category: ProductCategory.SERVICES,
      description: 'Engineer-led onsite deployment and handover. Thin margin, hence the 10% ceiling.',
      unitPrice: money(450), costPrice: money(180), unit: 'Each', taxPct: 15,
      isSubscription: false, quantityOnHand: 0, status: ProductStatus.ACTIVE, promoted: false, variants: [],
    },
    {
      _id: IDS.products.dock, sku: 'DS-001', name: 'Docking Station',
      category: ProductCategory.HARDWARE,
      description: 'USB-C docking station, 1 SKU.',
      unitPrice: money(180), costPrice: money(140), unit: 'Each', taxPct: 15,
      isSubscription: false, quantityOnHand: 65, status: ProductStatus.ACTIVE,
      promoted: true, promoTag: 'Promo, 12% off',
      variants: [{ attribute: 'Color', values: [{ value: 'Black', extraPrice: 0 }] }],
    },
    {
      _id: IDS.products.warranty, sku: 'EW-001', name: 'Extended Warranty',
      category: ProductCategory.HARDWARE,
      description: 'Two extra years of hardware cover.',
      unitPrice: money(180), costPrice: money(96), unit: 'Each', taxPct: 15,
      // 999 at Main + 999 at East. See the note above on why this is the sum.
      isSubscription: false, quantityOnHand: 1998, status: ProductStatus.ACTIVE, promoted: false, variants: [],
    },
    {
      _id: IDS.products.mouse, sku: 'WM-001', name: 'Wireless Mouse',
      category: ProductCategory.HARDWARE,
      description: 'Bluetooth mouse. The classic laptop attach.',
      unitPrice: money(30), costPrice: money(12), unit: 'Each', taxPct: 15,
      // 400 at Main + 60 at East.
      isSubscription: false, quantityOnHand: 460, status: ProductStatus.ACTIVE, promoted: false, variants: [],
    },
    {
      _id: IDS.products.carePlan2yr, sku: 'CP-2Y', name: 'Care Plan 2yr',
      category: ProductCategory.SUBSCRIPTION,
      description: 'Two-year care plan billed monthly. Invoiced at the beginning of each period.',
      unitPrice: money(46), costPrice: 0, unit: 'Recurring', taxPct: 5,
      isSubscription: true, recurringCycle: BillingCycle.MONTHLY,
      quantityOnHand: 0, status: ProductStatus.ACTIVE, promoted: false, variants: [],
    },
    {
      _id: IDS.products.supportSla, sku: 'SLA-Q', name: 'Support SLA',
      category: ProductCategory.SUBSCRIPTION,
      description: 'Priority support, billed quarterly.',
      unitPrice: money(300), costPrice: 0, unit: 'Recurring', taxPct: 5,
      isSubscription: true, recurringCycle: BillingCycle.QUARTERLY,
      quantityOnHand: 0, status: ProductStatus.ACTIVE, promoted: false, variants: [],
    },
    {
      _id: IDS.products.carePlan3yr, sku: 'CP-3Y', name: 'Care Plan 3 years',
      category: ProductCategory.SUBSCRIPTION,
      description: 'Three-year care plan billed monthly.',
      unitPrice: money(40), costPrice: 0, unit: 'Recurring', taxPct: 5,
      isSubscription: true, recurringCycle: BillingCycle.MONTHLY,
      quantityOnHand: 0, status: ProductStatus.ACTIVE, promoted: false, variants: [],
    },
    {
      _id: IDS.products.carePlan1yr, sku: 'CP-1Y', name: 'Care Plan 1yr',
      category: ProductCategory.SUBSCRIPTION,
      description: 'One-year care plan billed monthly.',
      unitPrice: money(28), costPrice: 0, unit: 'Recurring', taxPct: 5,
      isSubscription: true, recurringCycle: BillingCycle.MONTHLY,
      quantityOnHand: 0, status: ProductStatus.ACTIVE, promoted: false, variants: [],
    },
    // Two archived products so screen 16's "128 active, 4 archived" tile has real data behind it.
    {
      _id: IDS.products.laptop13Eol, sku: 'LP13-EOL', name: 'Laptop Pro 13 (EOL)',
      category: ProductCategory.HARDWARE, description: 'End of life.',
      unitPrice: money(950), costPrice: money(700), unit: 'Each', taxPct: 15,
      isSubscription: false, quantityOnHand: 0, status: ProductStatus.ARCHIVED, promoted: false, variants: [],
    },
  ]);

  // Historical co-purchase data. `coPurchaseFrequency` is the share of past orders
  // containing `productId` that also contained `suggestedProductId`.
  await ProductPairing.insertMany([
    { productId: IDS.products.laptop, suggestedProductId: IDS.products.mouse, coPurchaseFrequency: 0.78 },
    { productId: IDS.products.laptop, suggestedProductId: IDS.products.carePlan2yr, coPurchaseFrequency: 0.62 },
    { productId: IDS.products.laptop, suggestedProductId: IDS.products.dock, coPurchaseFrequency: 0.41 },
    { productId: IDS.products.laptop, suggestedProductId: IDS.products.warranty, coPurchaseFrequency: 0.35 },
    { productId: IDS.products.setup, suggestedProductId: IDS.products.supportSla, coPurchaseFrequency: 0.55 },
    { productId: IDS.products.dock, suggestedProductId: IDS.products.mouse, coPurchaseFrequency: 0.44 },
    { productId: IDS.products.warranty, suggestedProductId: IDS.products.carePlan2yr, coPurchaseFrequency: 0.5 },
  ]);
}
