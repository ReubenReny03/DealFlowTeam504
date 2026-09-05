import { Router } from 'express';
import { Notification } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const notificationsRouter = Router();

mountModuleHealth(notificationsRouter, {
  module: 'notifications', owner: 'C', screens: [2, 14],
  implemented: ['GET /', 'GET /:id'],
  todo: ['PATCH /:id/read (Agent C)'],
});

mountReadonly(notificationsRouter, {
  model: Notification,
  sort: { createdAt: -1 } as any,
  searchFields: ['title'],
  filterFields: ['read'],
});
