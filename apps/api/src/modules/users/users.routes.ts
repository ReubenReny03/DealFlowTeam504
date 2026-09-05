import { Router } from 'express';
import { User } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const usersRouter = Router();

mountModuleHealth(usersRouter, {
  module: 'users', owner: 'A', screens: [1],
  implemented: ['GET /', 'GET /:id'],
  todo: ['POST / (create internal user)', 'PATCH /:id (deactivate)'],
});

mountReadonly(usersRouter, {
  model: User,
  roles: ['ADMIN'] as any,
  searchFields: ['name','email'],
  filterFields: ['role'],
});
