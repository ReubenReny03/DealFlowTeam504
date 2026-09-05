import { Router } from 'express';
import { AuditLog } from '../../db/models.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const auditRouter = Router();

mountModuleHealth(auditRouter, {
  module: 'audit', domain: 'approvals', screens: [6],
  implemented: ['GET /', 'GET /:id'],
  todo: [],
});

mountReadonly(auditRouter, {
  model: AuditLog,
  sort: { timestamp: -1 } as any,
  searchFields: ['actor','action','entityLabel'],
  filterFields: ['entity','entityId','actorId'],
});
