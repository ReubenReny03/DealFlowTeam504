/** Screens 7 and 8. */
import { Router } from 'express';
import { Role, type FulfillmentListDto } from '@dealflow/shared';
import { Fulfillment, Stock, Warehouse, Product } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const fulfillmentRouter = Router();

mountModuleHealth(fulfillmentRouter, {
  module: 'fulfillment', owner: 'D', screens: [7, 8],
  implemented: ['GET / (live stock + orders awaiting fulfillment)', 'GET /:id'],
  todo: [
    'POST /plan/:orderId — run planWarehouseSplit and persist the proposal (Agent D)',
    'POST /:id/accept — reserve stock atomically, status -> RESERVED (Agent D)',
    'POST /:id/override — manual allocation, validated against availability, audit-logged with a reason (Agent D)',
    'POST /:id/ship — mark an allocation shipped, which is what unlocks invoicing (Agent D)',
    'GET /:id/consolidation — checkBackorderConsolidation, drives screen 8s auto-prompt banner (Agent D)',
  ],
});

const OPS: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER, Role.SALES_REP];

/** Screen 7: live stock per warehouse, plus everything awaiting fulfillment. */
fulfillmentRouter.get(
  '/',
  requireAuth(OPS),
  asyncHandler(async (_req, res) => {
    const [stock, warehouses, products, fulfillments] = await Promise.all([
      Stock.find().lean(),
      Warehouse.find().lean(),
      Product.find().select('name').lean(),
      Fulfillment.find({ status: { $nin: ['SHIPPED', 'CANCELLED'] } }).sort({ createdAt: -1 }).lean(),
    ]);
    const warehouseName = new Map((warehouses as any[]).map((w) => [String(w._id), w.name]));
    const productName = new Map((products as any[]).map((p) => [String(p._id), p.name]));

    const payload: FulfillmentListDto = {
      stock: (stock as any[]).map((s) => ({
        ...toDto(s),
        warehouseName: warehouseName.get(String(s.warehouseId)) ?? '',
        productName: productName.get(String(s.productId)) ?? '',
      })),
      awaiting: (fulfillments as any[]).map((f) => ({
        orderId: String(f.orderId),
        orderNumber: f.orderNumber,
        customerName: f.customerName,
        status: f.status,
        warehouses: f.allocations.map((a: any) => a.warehouseName).join(' + ') || '—',
        fulfillmentId: String(f._id),
      })),
    };
    ok(res, payload);
  }),
);

fulfillmentRouter.get(
  '/:id',
  requireAuth(OPS),
  asyncHandler(async (req, res) => {
    const doc = await Fulfillment.findOne({
      $or: [
        ...(req.params.id.match(/^[0-9a-f]{24}$/i) ? [{ _id: req.params.id }, { orderId: req.params.id }] : []),
        { orderNumber: req.params.id },
      ],
    }).lean();
    if (!doc) throw notFound(`No fulfillment for ${req.params.id}`);
    ok(res, toDto(doc));
  }),
);
