import { Router } from 'express';
import { mountModuleHealth } from '../module.health.js';

export const riskRouter = Router();

mountModuleHealth(riskRouter, {
  module: 'risk', owner: 'B', screens: [4, 6],
  implemented: ['GET /_health'],
  todo: ['POST /preview — blended risk preview for an unsaved cart (Agent B)'],
});

// This module is pure business logic with no collection of its own.
// Its endpoints are the owning agent's first task.
