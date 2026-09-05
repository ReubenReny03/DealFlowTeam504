import { Router } from 'express';
import { Role } from '@dealflow/shared';
import { Order } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';
import { createOrderFromQuotation } from './orders.service.js';

export const ordersRouter = Router();

mountModuleHealth(ordersRouter, {
  module: 'orders', owner: 'D', screens: [7, 8, 13],
  implemented: ['GET /', 'GET /:id', 'POST /from-quotation/:id'],
  todo: [],
});

mountReadonly(ordersRouter, {
  model: Order,
  sort: { confirmedAt: -1 } as any,
  searchFields: ['number','customerName'],
  filterFields: ['status','customerId'],
});

/**
 * Called by the portal's confirm endpoint, and directly usable by internal staff.
 * See `orders.service.ts` for the full contract: snapshot -> placeholder
 * fulfillment -> subscriptions with their first invoice.
 */
ordersRouter.post(
  '/from-quotation/:id',
  requireAuth([Role.ADMIN, Role.SALES_MANAGER, Role.SALES_REP, Role.FINANCE]),
  asyncHandler(async (req, res) => {
    const { order, fulfillment } = await createOrderFromQuotation(req.params.id, {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role,
    });
    ok(res, { order: toDto(order), fulfillment: fulfillment ? toDto(fulfillment) : null });
  }),
);
