/**
 * Every module mounts this, so `GET /api/v1/<module>/_health` reports whether the
 * module is wired, which part of the system it belongs to, which screens it
 * serves, and which of its endpoints are live.
 */
import { Router } from 'express';
import { ok } from '../utils/respond.js';

/** The area of the system a module belongs to. */
export type ModuleDomain =
  | 'platform'    // health, auth, accounts
  | 'catalogue'   // products, price lists, customers, plans
  | 'governance'  // discount ceilings and the approval chain
  | 'quotations'  // building, pricing, risk-scoring and upselling a quote
  | 'approvals'   // the approval state machine and the audit trail
  | 'portal'      // the customer-facing surface and negotiation
  | 'inventory'   // warehouses, stock, orders and fulfillment
  | 'billing'     // subscriptions, invoices and payments
  | 'analytics';  // deal health and reporting

export interface ModuleHealth {
  module: string;
  domain: ModuleDomain;
  screens: number[];
  implemented: string[];
  todo: string[];
}

export function mountModuleHealth(router: Router, info: ModuleHealth): Router {
  router.get('/_health', (_req, res) => {
    ok(res, { status: 'ok', ...info });
  });
  return router;
}
