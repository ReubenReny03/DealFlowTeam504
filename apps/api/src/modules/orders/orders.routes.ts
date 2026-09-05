import { Router } from 'express';
import { Order } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const ordersRouter = Router();

mountModuleHealth(ordersRouter, {
  module: 'orders', owner: 'D', screens: [7, 8, 13],
  implemented: ['GET /', 'GET /:id'],
  todo: ['POST /from-quotation/:id — called by Agent C on portal confirm (Agent D)'],
});

mountReadonly(ordersRouter, {
  model: Order,
  sort: { confirmedAt: -1 } as any,
  searchFields: ['number','customerName'],
  filterFields: ['status','customerId'],
});
