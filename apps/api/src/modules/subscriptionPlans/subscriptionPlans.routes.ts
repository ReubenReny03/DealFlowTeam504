import { Router } from 'express';
import { SubscriptionPlan } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const subscriptionPlansRouter = Router();

mountModuleHealth(subscriptionPlansRouter, {
  module: 'subscriptionPlans', owner: 'A', screens: [9, 17],
  implemented: ['GET /', 'GET /:id'],
  todo: ['POST / — + New Plan (Admin) button on screen 9 (Agent A)'],
});

mountReadonly(subscriptionPlansRouter, {
  model: SubscriptionPlan,
  sort: { name: 1 } as any,
  searchFields: ['name'],
  filterFields: ['cycle'],
});
