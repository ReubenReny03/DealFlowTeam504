/**
 * APPEND-ONLY ROUTE REGISTRY.
 *
 * Every module exposes one Express router and registers it here with a SINGLE
 * appended line. Nobody restructures this file, nobody edits anyone else's line,
 * and `app.ts` never changes again. That is what keeps four parallel agents from
 * ever touching the same file.
 *
 *   basePath is relative to API_BASE_PATH (default /api/v1).
 */
import type { Router } from 'express';

export interface RouteEntry {
  basePath: string;
  router: Router;
  /** Owning workstream, for merge triage. */
  owner: 'A' | 'B' | 'C' | 'D';
  description: string;
}

import { healthRouter } from './modules/health.router.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { productsRouter } from './modules/products/products.routes.js';
import { priceListsRouter } from './modules/pricelists/pricelists.routes.js';
import { warehousesRouter } from './modules/warehouses/warehouses.routes.js';
import { subscriptionPlansRouter } from './modules/subscriptionPlans/subscriptionPlans.routes.js';
import { configRouter } from './modules/config/config.routes.js';
import { quotationsRouter } from './modules/quotations/quotations.routes.js';
import { pricingRouter } from './modules/pricing/pricing.routes.js';
import { riskRouter } from './modules/risk/risk.routes.js';
import { upsellRouter } from './modules/upsell/upsell.routes.js';
import { approvalsRouter } from './modules/approvals/approvals.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { portalRouter } from './modules/portal/portal.routes.js';
import { negotiationRouter } from './modules/negotiation/negotiation.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { fulfillmentRouter } from './modules/fulfillment/fulfillment.routes.js';
import { stockRouter } from './modules/stock/stock.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes.js';
import { invoicesRouter } from './modules/invoices/invoices.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { dealHealthRouter } from './modules/dealHealth/dealHealth.routes.js';
import { reportingRouter } from './modules/reporting/reporting.routes.js';

/** ---- APPEND YOUR ROUTE BELOW THIS LINE, ONE LINE ONLY ---- */
export const ROUTES: RouteEntry[] = [
  { basePath: '/health',             router: healthRouter,            owner: 'A', description: 'Liveness and readiness' },
  { basePath: '/auth',               router: authRouter,              owner: 'A', description: 'Login, signup, session, demo accounts' },
  { basePath: '/users',              router: usersRouter,             owner: 'A', description: 'Internal users' },
  { basePath: '/customers',          router: customersRouter,         owner: 'A', description: 'Customers and tiers' },
  { basePath: '/products',           router: productsRouter,          owner: 'A', description: 'Catalogue (screens 16, 17)' },
  { basePath: '/pricelists',         router: priceListsRouter,        owner: 'A', description: 'Tier price lists' },
  { basePath: '/warehouses',         router: warehousesRouter,        owner: 'A', description: 'Warehouse setup' },
  { basePath: '/subscription-plans', router: subscriptionPlansRouter, owner: 'A', description: 'Recurring plan setup' },
  { basePath: '/config',             router: configRouter,            owner: 'A', description: 'Discount ceilings and approval chain (screen 18)' },
  { basePath: '/quotations',         router: quotationsRouter,        owner: 'B', description: 'Quotation CRUD, submit, dashboard (screens 2, 3, 4)' },
  { basePath: '/pricing',            router: pricingRouter,           owner: 'B', description: 'Price resolution and live preview' },
  { basePath: '/risk',               router: riskRouter,              owner: 'B', description: 'Blended risk preview' },
  { basePath: '/upsell',             router: upsellRouter,            owner: 'B', description: 'Upsell and cross-sell ranking' },
  { basePath: '/approvals',          router: approvalsRouter,         owner: 'C', description: 'Approval chain (screens 5, 6)' },
  { basePath: '/audit',              router: auditRouter,             owner: 'C', description: 'Audit trail' },
  { basePath: '/portal',             router: portalRouter,            owner: 'C', description: 'Customer portal (screen 11)' },
  { basePath: '/negotiation',        router: negotiationRouter,       owner: 'C', description: 'Line comments and counter-offers' },
  { basePath: '/notifications',      router: notificationsRouter,     owner: 'C', description: 'Nudges and escalations' },
  { basePath: '/fulfillment',        router: fulfillmentRouter,       owner: 'D', description: 'Warehouse split (screens 7, 8)' },
  { basePath: '/stock',              router: stockRouter,             owner: 'D', description: 'Live stock and reservations' },
  { basePath: '/orders',             router: ordersRouter,            owner: 'D', description: 'Orders created from confirmed quotations' },
  { basePath: '/billing',            router: billingRouter,           owner: 'D', description: 'Hybrid billing detail (screen 10)' },
  { basePath: '/subscriptions',      router: subscriptionsRouter,     owner: 'D', description: 'Subscriptions and proration (screen 9)' },
  { basePath: '/invoices',           router: invoicesRouter,          owner: 'D', description: 'Invoices (screens 12, 13)' },
  { basePath: '/payments',           router: paymentsRouter,          owner: 'D', description: 'Payment recording' },
  { basePath: '/deal-health',        router: dealHealthRouter,        owner: 'D', description: 'Stalled deals and anomalies (screen 14)' },
  { basePath: '/reporting',          router: reportingRouter,         owner: 'D', description: 'Reporting KPIs and export (screen 15)' },
];
