/**
 * APPEND-ONLY ROUTE REGISTRY.
 *
 * Every module exposes one Express router and registers it here on a single
 * appended line, so adding an endpoint never means editing `app.ts` and two
 * modules never collide in the same file.
 *
 *   basePath is relative to API_BASE_PATH (default /api/v1).
 */
import type { Router } from 'express';
import type { ModuleDomain } from './modules/module.health.js';

export interface RouteEntry {
  basePath: string;
  router: Router;
  /** The area of the system this module belongs to. */
  domain: ModuleDomain;
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

/** ---- APPEND A ROUTE BELOW THIS LINE, ONE LINE ONLY ---- */
export const ROUTES: RouteEntry[] = [
  { basePath: '/health',             router: healthRouter,            domain: 'platform', description: 'Liveness and readiness' },
  { basePath: '/auth',               router: authRouter,              domain: 'platform', description: 'Login, session, password change, demo accounts' },
  { basePath: '/users',              router: usersRouter,             domain: 'platform', description: 'Accounts — internal users and portal logins' },
  { basePath: '/customers',          router: customersRouter,         domain: 'catalogue', description: 'Customers and tiers' },
  { basePath: '/products',           router: productsRouter,          domain: 'catalogue', description: 'Catalogue (screens 16, 17)' },
  { basePath: '/pricelists',         router: priceListsRouter,        domain: 'catalogue', description: 'Tier price lists' },
  { basePath: '/warehouses',         router: warehousesRouter,        domain: 'inventory', description: 'Warehouse setup' },
  { basePath: '/subscription-plans', router: subscriptionPlansRouter, domain: 'catalogue', description: 'Recurring plan setup' },
  { basePath: '/config',             router: configRouter,            domain: 'governance', description: 'Discount ceilings and approval chain (screen 18)' },
  { basePath: '/quotations',         router: quotationsRouter,        domain: 'quotations', description: 'Quotation CRUD, submit, dashboard (screens 2, 3, 4)' },
  { basePath: '/pricing',            router: pricingRouter,           domain: 'quotations', description: 'Price resolution and live preview' },
  { basePath: '/risk',               router: riskRouter,              domain: 'quotations', description: 'Blended risk preview' },
  { basePath: '/upsell',             router: upsellRouter,            domain: 'quotations', description: 'Upsell and cross-sell ranking' },
  { basePath: '/approvals',          router: approvalsRouter,         domain: 'approvals', description: 'Approval chain (screens 5, 6)' },
  { basePath: '/audit',              router: auditRouter,             domain: 'approvals', description: 'Audit trail' },
  { basePath: '/portal',             router: portalRouter,            domain: 'portal', description: 'Customer portal (screen 11)' },
  { basePath: '/negotiation',        router: negotiationRouter,       domain: 'portal', description: 'Line comments and counter-offers' },
  { basePath: '/notifications',      router: notificationsRouter,     domain: 'portal', description: 'Nudges and escalations' },
  { basePath: '/fulfillment',        router: fulfillmentRouter,       domain: 'inventory', description: 'Warehouse split (screens 7, 8)' },
  { basePath: '/stock',              router: stockRouter,             domain: 'inventory', description: 'Live stock and reservations' },
  { basePath: '/orders',             router: ordersRouter,            domain: 'inventory', description: 'Orders created from confirmed quotations' },
  { basePath: '/billing',            router: billingRouter,           domain: 'billing', description: 'Hybrid billing detail (screen 10)' },
  { basePath: '/subscriptions',      router: subscriptionsRouter,     domain: 'billing', description: 'Subscriptions and proration (screen 9)' },
  { basePath: '/invoices',           router: invoicesRouter,          domain: 'billing', description: 'Invoices (screens 12, 13)' },
  { basePath: '/payments',           router: paymentsRouter,          domain: 'billing', description: 'Payment recording' },
  { basePath: '/deal-health',        router: dealHealthRouter,        domain: 'analytics', description: 'Stalled deals and anomalies (screen 14)' },
  { basePath: '/reporting',          router: reportingRouter,         domain: 'analytics', description: 'Reporting KPIs and export (screen 15)' },
];
