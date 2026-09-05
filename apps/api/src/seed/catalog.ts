/** Product references shared by the quotation, order and billing seeds. */
import { BillingCycle, ProductCategory, money } from '@dealflow/shared';
import { IDS } from './ids.js';
import type { SeedPriceListRef, SeedProductRef } from './build.js';
import { PriceRuleType } from '@dealflow/shared';

export const P: Record<string, SeedProductRef> = {
  laptop: { id: IDS.products.laptop, sku: 'LP14-BASE', name: 'Laptop Pro 14', category: ProductCategory.HARDWARE, basePrice: money(1200), costPrice: money(820), taxPct: 15 },
  setup: { id: IDS.products.setup, sku: 'SVC-ONSITE', name: 'Onsite Setup Service', category: ProductCategory.SERVICES, basePrice: money(450), costPrice: money(180), taxPct: 15 },
  dock: { id: IDS.products.dock, sku: 'DS-001', name: 'Docking Station', category: ProductCategory.HARDWARE, basePrice: money(180), costPrice: money(140), taxPct: 15 },
  warranty: { id: IDS.products.warranty, sku: 'EW-001', name: 'Extended Warranty', category: ProductCategory.HARDWARE, basePrice: money(180), costPrice: money(96), taxPct: 15 },
  mouse: { id: IDS.products.mouse, sku: 'WM-001', name: 'Wireless Mouse', category: ProductCategory.HARDWARE, basePrice: money(30), costPrice: money(12), taxPct: 15 },
  carePlan2yr: { id: IDS.products.carePlan2yr, sku: 'CP-2Y', name: 'Care Plan 2yr', category: ProductCategory.SUBSCRIPTION, basePrice: money(46), costPrice: 0, taxPct: 5, isSubscription: true, recurringCycle: BillingCycle.MONTHLY },
  supportSla: { id: IDS.products.supportSla, sku: 'SLA-Q', name: 'Support SLA', category: ProductCategory.SUBSCRIPTION, basePrice: money(300), costPrice: 0, taxPct: 5, isSubscription: true, recurringCycle: BillingCycle.QUARTERLY },
  carePlan1yr: { id: IDS.products.carePlan1yr, sku: 'CP-1Y', name: 'Care Plan 1yr', category: ProductCategory.SUBSCRIPTION, basePrice: money(28), costPrice: 0, taxPct: 5, isSubscription: true, recurringCycle: BillingCycle.MONTHLY },
};

/**
 * Price-list rules per tier, exactly as configured on screen 17.
 * NOTE: the Gold "base minus 10 percent" rule scales EVERY line by the same
 * factor, so it cannot change the revenue-weighted blended risk score — Q-1042
 * still scores 33. See docs/DECISIONS.md D-015 and the invariance unit test.
 */
export const PRICE_LISTS: Record<string, SeedPriceListRef> = {
  BRONZE: { ruleType: PriceRuleType.NONE, ruleValue: 0 },
  SILVER: { ruleType: PriceRuleType.PERCENT_OFF_BASE, ruleValue: 5 },
  GOLD: { ruleType: PriceRuleType.PERCENT_OFF_BASE, ruleValue: 10 },
};
