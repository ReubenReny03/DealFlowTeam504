import { Router } from 'express';
import { Warehouse } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const warehousesRouter = Router();

mountModuleHealth(warehousesRouter, {
  module: 'warehouses', owner: 'A', screens: [7],
  implemented: ['GET /', 'GET /:id'],
  todo: ['POST / and PUT /:id — warehouse + replenishment setup (Agent A)'],
});

mountReadonly(warehousesRouter, {
  model: Warehouse,
  sort: { name: 1 } as any,
  searchFields: ['name','code'],
});
