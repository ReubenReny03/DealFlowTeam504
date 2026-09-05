import { Router } from 'express';
import { mountModuleHealth } from '../module.health.js';

export const pricingRouter = Router();

mountModuleHealth(pricingRouter, {
  module: 'pricing', owner: 'B', screens: [4],
  implemented: ['GET /_health'],
  todo: ['POST /preview — price a cart against a customer\'s price list (Agent B)'],
});

// This module is pure business logic with no collection of its own.
// Its endpoints are the owning agent's first task.
