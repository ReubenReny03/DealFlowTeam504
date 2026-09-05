import { Router } from 'express';
import { z } from 'zod';
import { AuditEntity, FulfillmentStatus, Role, checkBackorderConsolidation, type AdjustStockRequest } from '@dealflow/shared';
import { Fulfillment, Stock } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';
import { stockAndWarehouseCatalog, toSplitBackorders } from '../fulfillment/fulfillment.service.js';

export const stockRouter = Router();

mountModuleHealth(stockRouter, {
  module: 'stock', domain: 'inventory', screens: [7],
  implemented: ['GET /', 'GET /:id', 'POST /adjust'],
  todo: [],
});

mountReadonly(stockRouter, {
  model: Stock,
  sort: { warehouseId: 1 } as any,
  filterFields: ['warehouseId','productId'],
});

const adjustSchema = z.object({
  warehouseId: z.string().min(1),
  productId: z.string().min(1),
  delta: z.number().int(),
  reason: z.string().trim().min(1, 'A reason is required.'),
});

/** Restock (or write down) a warehouse's stock, and flip any now-coverable backorder. */
stockRouter.post(
  '/adjust',
  requireAuth([Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER]),
  validate(adjustSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as AdjustStockRequest;
    let stock: any = await Stock.findOne({ warehouseId: body.warehouseId, productId: body.productId });
    if (!stock) {
      if (body.delta < 0) throw badRequest('Cannot reduce stock that does not exist yet.');
      stock = new Stock({ warehouseId: body.warehouseId, productId: body.productId, inStock: 0, reserved: 0 });
    }
    const nextInStock = stock.inStock + body.delta;
    if (nextInStock < 0) throw badRequest(`Adjustment would take stock negative (currently ${stock.inStock}).`);
    stock.inStock = nextInStock;
    await stock.save();

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: body.delta >= 0 ? 'STOCK_RESTOCKED' : 'STOCK_WRITTEN_DOWN',
      entity: AuditEntity.STOCK,
      entityId: String(stock._id),
      after: { warehouseId: body.warehouseId, productId: body.productId, delta: body.delta, inStock: stock.inStock },
      reason: body.reason,
    });

    // Restocking may now cover a previously-backordered fulfillment.
    const candidates = await Fulfillment.find({
      status: FulfillmentStatus.BACKORDER,
      'backorders.productId': body.productId,
      consolidationAvailableAt: { $exists: false },
    });
    const { splitStock } = await stockAndWarehouseCatalog();
    const flipped: string[] = [];
    for (const fulfillment of candidates) {
      const { available } = checkBackorderConsolidation(toSplitBackorders((fulfillment as any).backorders), splitStock);
      if (available) {
        (fulfillment as any).consolidationAvailableAt = new Date();
        await fulfillment.save();
        flipped.push((fulfillment as any).orderNumber);
        await writeAudit({
          actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
          action: 'CONSOLIDATION_AVAILABLE',
          entity: AuditEntity.FULFILLMENT,
          entityId: String(fulfillment._id),
          entityLabel: (fulfillment as any).orderNumber,
          reason: 'Restock now covers the outstanding backorder',
        });
      }
    }

    ok(res, { stock: toDto(stock), consolidationAvailableFor: flipped });
  }),
);
