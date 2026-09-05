import { Router } from 'express';
import { Notification } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { forbidden, notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const notificationsRouter = Router();

mountModuleHealth(notificationsRouter, {
  module: 'notifications', owner: 'C', screens: [2, 14],
  implemented: ['GET /', 'GET /:id', 'PATCH /:id/read'],
  todo: [],
});

mountReadonly(notificationsRouter, {
  model: Notification,
  sort: { createdAt: -1 } as any,
  searchFields: ['title'],
  filterFields: ['read'],
});

notificationsRouter.patch(
  '/:id/read',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const doc: any = await Notification.findById(req.params.id);
    if (!doc) throw notFound(`No notification with id ${req.params.id}`);
    if (String(doc.userId) !== String(req.user!.id)) throw forbidden('This notification does not belong to you.');
    doc.read = true;
    await doc.save();
    ok(res, toDto(doc));
  }),
);
