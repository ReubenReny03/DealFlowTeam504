import { Router } from 'express';
import { Stock } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const stockRouter = Router();

mountModuleHealth(stockRouter, {
  module: 'stock', owner: 'D', screens: [7],
  implemented: ['GET /', 'GET /:id'],
  todo: ['POST /adjust — restock, which must flip a backorder to CONSOLIDATION_AVAILABLE (Agent D)'],
});

mountReadonly(stockRouter, {
  model: Stock,
  sort: { warehouseId: 1 } as any,
  filterFields: ['warehouseId','productId'],
});
