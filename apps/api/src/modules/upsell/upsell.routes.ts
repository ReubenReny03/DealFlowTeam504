import { Router } from 'express';
import { mountModuleHealth } from '../module.health.js';

export const upsellRouter = Router();

mountModuleHealth(upsellRouter, {
  module: 'upsell', owner: 'B', screens: [4],
  implemented: ['GET /_health'],
  todo: ['GET /suggestions?quotationId= — ranked upsell panel (Agent B)'],
});

// This module is pure business logic with no collection of its own.
// Its endpoints are the owning agent's first task.
