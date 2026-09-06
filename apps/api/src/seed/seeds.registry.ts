/**
 * APPEND-ONLY SEED REGISTRY.
 *
 * One line per seed module. The file is only ever appended to, so adding seed
 * data never means restructuring what is already here.
 *
 * `order` fixes the dependency sequence:
 *   10 config -> 20 users -> 30 pricelists/customers -> 40 products
 *   -> 50 warehouses/stock -> 60 plans -> 70 quotations -> 80 approvals+audit
 *   -> 90 orders/fulfillment -> 100 invoices/subscriptions -> 110 alerts
 *   -> 120 reporting history
 */
import type { ModuleDomain } from '../modules/module.health.js';
import type { SeedContext } from './context.js';

export interface SeedModule {
  name: string;
  order: number;
  /** The area of the system this data belongs to. */
  domain: ModuleDomain;
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
import { seedRepeatBusiness } from './modules/repeatBusiness.seed.js';
import { seedBilling } from './modules/billing.seed.js';
import { seedAlerts } from './modules/alerts.seed.js';
import { seedReportingHistory } from './modules/history.seed.js';

/** ---- APPEND A SEED MODULE BELOW THIS LINE, ONE LINE ONLY ---- */
export const SEED_MODULES: SeedModule[] = [
  { name: 'config',            order: 10,  domain: 'governance', run: seedConfig },
  { name: 'users',             order: 20,  domain: 'platform', run: seedUsers },
  { name: 'pricelists+customers', order: 30, domain: 'catalogue', run: seedPriceListsAndCustomers },
  { name: 'products',          order: 40,  domain: 'catalogue', run: seedProducts },
  { name: 'warehouses+stock',  order: 50,  domain: 'inventory', run: seedWarehousesAndStock },
  { name: 'subscriptionPlans', order: 60,  domain: 'catalogue', run: seedSubscriptionPlans },
  { name: 'quotations',        order: 70,  domain: 'quotations', run: seedQuotations },
  { name: 'approvals+audit',   order: 80,  domain: 'approvals', run: seedApprovalsAndAudit },
  { name: 'orders+fulfillment',order: 90,  domain: 'inventory', run: seedOrdersAndFulfillment },
  { name: 'repeatBusiness',    order: 95,  domain: 'inventory', run: seedRepeatBusiness },
  { name: 'billing',           order: 100, domain: 'billing', run: seedBilling },
  { name: 'alerts',            order: 120, domain: 'analytics', run: seedAlerts },
  { name: 'reportingHistory',  order: 110, domain: 'analytics', run: seedReportingHistory },
];

export function orderedSeedModules(): SeedModule[] {
  return [...SEED_MODULES].sort((a, b) => a.order - b.order);
}
