import { Router } from 'express';
import { PriceList } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const priceListsRouter = Router();

mountModuleHealth(priceListsRouter, {
  module: 'pricelists', owner: 'A', screens: [17],
  implemented: ['GET /', 'GET /:id'],
  todo: ['PUT /:id — edit a tier\'s price rule (Agent A, screen 17)'],
});

mountReadonly(priceListsRouter, {
  model: PriceList,
  sort: { tier: 1 } as any,
  searchFields: ['name'],
  filterFields: ['tier'],
});
