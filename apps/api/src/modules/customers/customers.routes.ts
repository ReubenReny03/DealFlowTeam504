import { Router } from 'express';
import { Customer } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const customersRouter = Router();

mountModuleHealth(customersRouter, {
  module: 'customers', owner: 'A', screens: [3, 11],
  implemented: ['GET /', 'GET /:id'],
  todo: ['POST / and PATCH /:id (Agent A)'],
});

mountReadonly(customersRouter, {
  model: Customer,
  sort: { name: 1 } as any,
  searchFields: ['name','contactEmail'],
  filterFields: ['tier','ownerId'],
});
