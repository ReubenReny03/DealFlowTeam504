/**
 * APPEND-ONLY SEED REGISTRY.
 *
 * Each agent adds ONE line here for their own seed module. Never reorder, never
 * edit someone else's entry, never restructure this file — that is what keeps
 * four parallel agents out of each other's merge conflicts.
 *
 * `order` fixes the dependency sequence:
 *   10 config -> 20 users -> 30 pricelists/customers -> 40 products
 *   -> 50 warehouses/stock -> 60 plans -> 70 quotations -> 80 approvals+audit
 *   -> 90 orders/fulfillment -> 100 invoices/subscriptions -> 110 alerts
 *   -> 120 reporting history
 */
import type { SeedContext } from './context.js';

export interface SeedModule {
  name: string;
  order: number;
  /** Which agent owns this seed file. */
  owner: 'A' | 'B' | 'C' | 'D';
  run: (ctx: SeedContext) => Promise<void>;
}

import { seedConfig } from './modules/config.seed.js';
import { seedUsers } from './users.seed.js';
import { seedPriceListsAndCustomers } from './modules/customers.seed.js';
import { seedProducts } from './modules/products.seed.js';
import { seedWarehousesAndStock } from './modules/warehouses.seed.js';
import { seedSubscriptionPlans } from './modules/plans.seed.js';
import { seedQuotations } from './modules/quotations.seed.js';
import { seedApprovalsAndAudit } from './modules/approvals.seed.js';
import { seedOrdersAndFulfillment } from './modules/fulfillment.seed.js';
import { seedBilling } from './modules/billing.seed.js';
import { seedAlerts } from './modules/alerts.seed.js';
import { seedReportingHistory } from './modules/history.seed.js';

/** ---- APPEND YOUR SEED MODULE BELOW THIS LINE, ONE LINE ONLY ---- */
export const SEED_MODULES: SeedModule[] = [
  { name: 'config',            order: 10,  owner: 'A', run: seedConfig },
  { name: 'users',             order: 20,  owner: 'A', run: seedUsers },
  { name: 'pricelists+customers', order: 30, owner: 'A', run: seedPriceListsAndCustomers },
  { name: 'products',          order: 40,  owner: 'A', run: seedProducts },
  { name: 'warehouses+stock',  order: 50,  owner: 'A', run: seedWarehousesAndStock },
  { name: 'subscriptionPlans', order: 60,  owner: 'A', run: seedSubscriptionPlans },
  { name: 'quotations',        order: 70,  owner: 'B', run: seedQuotations },
  { name: 'approvals+audit',   order: 80,  owner: 'C', run: seedApprovalsAndAudit },
  { name: 'orders+fulfillment',order: 90,  owner: 'D', run: seedOrdersAndFulfillment },
  { name: 'billing',           order: 100, owner: 'D', run: seedBilling },
  { name: 'alerts',            order: 120, owner: 'D', run: seedAlerts },
  { name: 'reportingHistory',  order: 110, owner: 'D', run: seedReportingHistory },
];

export function orderedSeedModules(): SeedModule[] {
  return [...SEED_MODULES].sort((a, b) => a.order - b.order);
}
