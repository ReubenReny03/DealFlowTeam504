import { Router } from 'express';
import { NegotiationEvent } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const negotiationRouter = Router();

mountModuleHealth(negotiationRouter, {
  module: 'negotiation', owner: 'C', screens: [11],
  implemented: ['GET /', 'GET /:id'],
  todo: ['POST /:quotationId/comment and /counter — internal-side replies (Agent C)'],
});

mountReadonly(negotiationRouter, {
  model: NegotiationEvent,
  sort: { createdAt: 1 } as any,
  searchFields: ['comment'],
  filterFields: ['quotationId'],
});
