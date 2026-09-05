import { Router } from 'express';
import { mountModuleHealth } from '../module.health.js';

export const paymentsRouter = Router();

mountModuleHealth(paymentsRouter, {
  module: 'payments', owner: 'D', screens: [13],
  implemented: ['GET /_health'],
  todo: ['POST /invoices/:id/payments lives on the invoices router; this module holds the service (Agent D)'],
});

// This module is pure business logic with no collection of its own.
// Its endpoints are the owning agent's first task.
