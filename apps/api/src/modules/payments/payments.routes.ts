import { Router } from 'express';
import { mountModuleHealth } from '../module.health.js';

export const paymentsRouter = Router();

mountModuleHealth(paymentsRouter, {
  module: 'payments', owner: 'D', screens: [13],
  implemented: ['GET /_health', 'POST /invoices/:id/payments (mounted on the invoices router — see invoices.routes.ts)'],
  todo: [],
});

// This module is pure business logic with no collection of its own; the
// actual endpoint is mounted on the invoices router, since a payment always
// belongs to one invoice.
