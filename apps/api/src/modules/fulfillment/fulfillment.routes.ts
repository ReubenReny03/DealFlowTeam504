/** Screens 7 and 8. */
import { Router } from 'express';
import { z } from 'zod';
import {
  AuditEntity,
  FulfillmentStatus,
  OrderStatus,
  Role,
  checkBackorderConsolidation,
  type FulfillmentListDto,
  type ManualSplitOverrideRequest,
} from '@dealflow/shared';
import { Fulfillment, Order, Stock, Warehouse, Product } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { withTransaction } from '../../db/connection.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, insufficientStock, invalidState, notFound } from '../../utils/apiError.js';
import { listParams, pageMeta, searchRegex, stableSort } from '../../utils/listQuery.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';
import { planAndApply, stockAndWarehouseCatalog, toSplitBackorders } from './fulfillment.service.js';

export const fulfillmentRouter = Router();

mountModuleHealth(fulfillmentRouter, {
  module: 'fulfillment', domain: 'inventory', screens: [7, 8],
  implemented: [
    'GET / (live stock + orders awaiting fulfillment)', 'GET /:id',
    'POST /plan/:orderId', 'POST /:id/accept', 'POST /:id/override', 'POST /:id/ship',
    'GET /:id/consolidation', 'POST /:id/consolidate',
  ],
  todo: [],
});

const OPS: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER, Role.SALES_REP];
const WRITE: Role[] = [Role.ADMIN, Role.FINANCE, Role.SALES_MANAGER];

/**
 * Screen 7: live stock per warehouse, plus everything awaiting fulfillment.
 *
 * Two independent lists in one payload, so each gets its own page cursor —
 * `?stockPage=` and `?awaitingPage=` — while a single `?q=` narrows both. Stock
 * carries no denormalised names, so a search on it resolves matching warehouses
 * and products first and filters by their ids.
 */
fulfillmentRouter.get(
  '/',
  requireAuth(OPS),
  asyncHandler(async (req, res) => {
    const stockParams = listParams(req.query, { prefix: 'stock', defaultPageSize: 25 });
    const awaitingParams = listParams(req.query, { prefix: 'awaiting', defaultPageSize: 25 });
    const q = stockParams.q ?? awaitingParams.q ?? (typeof req.query.q === 'string' ? req.query.q.trim() || undefined : undefined);

    const [warehouses, products] = await Promise.all([
      Warehouse.find().lean(),
      Product.find().select('name sku').lean(),
    ]);
    const warehouseName = new Map((warehouses as any[]).map((w) => [String(w._id), w.name]));
    const productName = new Map((products as any[]).map((p) => [String(p._id), p.name]));

    const stockFilter: Record<string, unknown> = {};
    if (q) {
      const term = searchRegex(q);
      const rx = new RegExp(term.$regex, term.$options);
      stockFilter.$or = [
        { warehouseId: { $in: (warehouses as any[]).filter((w) => rx.test(w.name) || rx.test(w.code ?? '')).map((w) => w._id) } },
        { productId: { $in: (products as any[]).filter((p) => rx.test(p.name) || rx.test(p.sku ?? '')).map((p) => p._id) } },
      ];
    }
    const awaitingFilter: Record<string, unknown> = { status: { $nin: ['SHIPPED', 'CANCELLED'] } };
    if (q) {
      const term = searchRegex(q);
      awaitingFilter.$or = [{ orderNumber: term }, { customerName: term }];
    }

    const [stock, stockTotal, fulfillments, awaitingTotal] = await Promise.all([
      Stock.find(stockFilter).sort(stableSort({ warehouseId: 1 })).skip(stockParams.skip).limit(stockParams.pageSize).lean(),
      Stock.countDocuments(stockFilter),
      Fulfillment.find(awaitingFilter).sort(stableSort({ createdAt: -1 })).skip(awaitingParams.skip).limit(awaitingParams.pageSize).lean(),
      Fulfillment.countDocuments(awaitingFilter),
    ]);

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
    ok(res, payload, {
      q,
      stock: pageMeta(stockParams, stockTotal),
      awaiting: pageMeta(awaitingParams, awaitingTotal),
    });
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

/* ------------------------------------------------------------------ writes */

async function findOrder(idOrNumber: string) {
  const order = await Order.findOne({
    $or: [
      ...(idOrNumber.match(/^[0-9a-f]{24}$/i) ? [{ _id: idOrNumber }] : []),
      { number: idOrNumber },
    ],
  });
  if (!order) throw notFound(`No order ${idOrNumber}`);
  return order;
}

async function stockRowsFor(warehouseIds: string[], productIds: string[]) {
  const [rows, warehouses, products] = await Promise.all([
    Stock.find({ warehouseId: { $in: warehouseIds }, productId: { $in: productIds } }).lean(),
    Warehouse.find({ _id: { $in: warehouseIds } }).select('name').lean(),
    Product.find({ _id: { $in: productIds } }).select('name').lean(),
  ]);
  const wName = new Map((warehouses as any[]).map((w) => [String(w._id), w.name]));
  const pName = new Map((products as any[]).map((p) => [String(p._id), p.name]));
  return (rows as any[]).map((r) => ({
    ...toDto(r),
    warehouseName: wName.get(String(r.warehouseId)) ?? '',
    productName: pName.get(String(r.productId)) ?? '',
  }));
}

/** Screen 8's "why this split" panel. Re-run any time before acceptance. */
fulfillmentRouter.post(
  '/plan/:orderId',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const order: any = await findOrder(req.params.orderId);
    let fulfillment: any = order.fulfillmentId ? await Fulfillment.findById(order.fulfillmentId) : null;
    if (!fulfillment) fulfillment = await Fulfillment.findOne({ orderId: order._id });
    if (!fulfillment) throw notFound(`No fulfillment record for order ${order.number}`);
    if ([FulfillmentStatus.SHIPPED, FulfillmentStatus.PARTIALLY_SHIPPED, FulfillmentStatus.CANCELLED].includes(fulfillment.status)) {
      throw invalidState(`This fulfillment is already ${fulfillment.status} and cannot be replanned.`);
    }

    const stockable = (order.lines as any[]).filter((l) => !l.isSubscription);

    await withTransaction(async (session) => {
      // Re-planning must never double-count: release whatever this fulfillment
      // currently holds reserved (e.g. from an earlier accept/override) before
      // computing a fresh proposal against live stock.
      if (fulfillment.reserved) {
        for (const alloc of fulfillment.allocations as any[]) {
          for (const line of alloc.lines as any[]) {
            await Stock.updateOne(
              { warehouseId: alloc.warehouseId, productId: line.productId },
              { $inc: { reserved: -line.qty, available: line.qty } },
              { session: session ?? undefined },
            );
          }
        }
      }
      await planAndApply(fulfillment, stockable);
      await fulfillment.save({ session: session ?? undefined });
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'FULFILLMENT_PLANNED',
      entity: AuditEntity.FULFILLMENT,
      entityId: String(fulfillment._id),
      entityLabel: order.number,
      after: { warehouses: fulfillment.allocations.length, backorderedUnits: fulfillment.backorders.reduce((a: number, b: any) => a + b.qty, 0) },
      reason: 'Warehouse split planned',
    });

    ok(res, toDto(fulfillment));
  }),
);

/** Reserve the CURRENT allocations atomically. */
fulfillmentRouter.post(
  '/:id/accept',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const fulfillment: any = await Fulfillment.findById(req.params.id);
    if (!fulfillment) throw notFound(`No fulfillment with id ${req.params.id}`);
    if (fulfillment.reserved) throw invalidState('This split has already been accepted.');
    if ([FulfillmentStatus.SHIPPED, FulfillmentStatus.CANCELLED].includes(fulfillment.status)) {
      throw invalidState(`This fulfillment is ${fulfillment.status} and cannot be accepted.`);
    }

    const touched = new Set<string>();
    await withTransaction(async (session) => {
      for (const alloc of fulfillment.allocations as any[]) {
        for (const line of alloc.lines as any[]) {
          const stock: any = await Stock.findOne({ warehouseId: alloc.warehouseId, productId: line.productId }).session(session ?? null);
          const available = stock ? Math.max(0, stock.inStock - stock.reserved) : 0;
          if (available < line.qty) {
            throw insufficientStock(
              `Only ${available} of ${line.productName} available at ${alloc.warehouseName}, need ${line.qty}.`,
              { warehouseId: String(alloc.warehouseId), productId: String(line.productId), available, requested: line.qty },
            );
          }
        }
      }
      for (const alloc of fulfillment.allocations as any[]) {
        for (const line of alloc.lines as any[]) {
          await Stock.updateOne(
            { warehouseId: alloc.warehouseId, productId: line.productId },
            { $inc: { reserved: line.qty, available: -line.qty } },
            { session: session ?? undefined },
          );
          touched.add(`${alloc.warehouseId}:${line.productId}`);
        }
      }
      fulfillment.reserved = true;
      fulfillment.status = fulfillment.backorders.length > 0 ? FulfillmentStatus.BACKORDER : FulfillmentStatus.RESERVED;
      await fulfillment.save({ session: session ?? undefined });
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'FULFILLMENT_ACCEPTED',
      entity: AuditEntity.FULFILLMENT,
      entityId: String(fulfillment._id),
      entityLabel: fulfillment.orderNumber,
      reason: 'Suggested split accepted; stock reserved',
    });

    const pairs = [...touched].map((k) => k.split(':'));
    const stock = await stockRowsFor(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    ok(res, { fulfillment: toDto(fulfillment), stock });
  }),
);

const overrideSchema = z.object({
  allocations: z.array(z.object({
    warehouseId: z.string().min(1),
    lines: z.array(z.object({ lineId: z.string().min(1), qty: z.number().int().min(0) })),
  })),
  reason: z.string().trim().min(1, 'A reason is required.'),
});

/** Manual allocation, validated against live availability, and reserved immediately. */
fulfillmentRouter.post(
  '/:id/override',
  requireAuth(WRITE),
  validate(overrideSchema),
  asyncHandler(async (req, res) => {
    const fulfillment: any = await Fulfillment.findById(req.params.id);
    if (!fulfillment) throw notFound(`No fulfillment with id ${req.params.id}`);
    if ([FulfillmentStatus.SHIPPED, FulfillmentStatus.PARTIALLY_SHIPPED, FulfillmentStatus.CANCELLED].includes(fulfillment.status)) {
      throw invalidState(`This fulfillment is ${fulfillment.status} and can no longer be overridden.`);
    }
    const order: any = await Order.findById(fulfillment.orderId).lean();
    if (!order) throw notFound(`No order for fulfillment ${fulfillment._id}`);
    const body = req.body as ManualSplitOverrideRequest;

    const orderLineById = new Map((order.lines as any[]).map((l) => [l.lineId, l]));
    const warehouses = await Warehouse.find({ _id: { $in: body.allocations.map((a) => a.warehouseId) } }).lean();
    const warehouseById = new Map((warehouses as any[]).map((w) => [String(w._id), w]));

    // Virtual availability: start from live stock, then credit back whatever THIS
    // fulfillment currently holds reserved, since the override replaces it.
    const virtual = new Map<string, number>();
    const stockKey = (w: string, p: string) => `${w}:${p}`;
    const neededPairs = new Set<string>();
    for (const a of body.allocations) for (const l of a.lines) neededPairs.add(stockKey(a.warehouseId, orderLineById.get(l.lineId)?.productId?.toString() ?? ''));
    for (const key of neededPairs) {
      const [warehouseId, productId] = key.split(':');
      if (!productId) continue;
      const row: any = await Stock.findOne({ warehouseId, productId }).lean();
      virtual.set(key, row ? Math.max(0, row.inStock - row.reserved) : 0);
    }
    if (fulfillment.reserved) {
      for (const alloc of fulfillment.allocations as any[]) {
        for (const line of alloc.lines as any[]) {
          const key = stockKey(String(alloc.warehouseId), String(line.productId));
          virtual.set(key, (virtual.get(key) ?? 0) + line.qty);
        }
      }
    }

    const allocatedPerLine = new Map<string, number>();
    const newAllocations: any[] = [];
    for (const a of body.allocations) {
      const warehouse = warehouseById.get(a.warehouseId);
      if (!warehouse) throw badRequest(`No warehouse with id ${a.warehouseId}`);
      const lines: any[] = [];
      for (const l of a.lines) {
        if (l.qty <= 0) continue;
        const orderLine = orderLineById.get(l.lineId);
        if (!orderLine) throw badRequest(`Order has no line ${l.lineId}`);
        const key = stockKey(a.warehouseId, String(orderLine.productId));
        const avail = virtual.get(key) ?? 0;
        if (avail < l.qty) {
          throw insufficientStock(
            `Only ${avail} of ${orderLine.productName} available at ${warehouse.name}, need ${l.qty}.`,
            { warehouseId: a.warehouseId, productId: String(orderLine.productId), available: avail, requested: l.qty },
          );
        }
        virtual.set(key, avail - l.qty);
        allocatedPerLine.set(l.lineId, (allocatedPerLine.get(l.lineId) ?? 0) + l.qty);
        lines.push({ lineId: l.lineId, productId: orderLine.productId, productName: orderLine.productName, qty: l.qty });
      }
      if (lines.length === 0) continue;
      const qty = lines.reduce((acc, x) => acc + x.qty, 0);
      newAllocations.push({
        warehouseId: warehouse._id, warehouseName: warehouse.name, lines, qty,
        estShipments: 1, estCost: warehouse.baseShipmentCost + warehouse.perUnitShippingCost * qty,
        shipped: false,
      });
    }

    const backorders = (order.lines as any[])
      .filter((l) => !l.isSubscription)
      .map((l) => ({ line: l, short: l.qty - (allocatedPerLine.get(l.lineId) ?? 0) }))
      .filter(({ short }) => short > 0)
      .map(({ line, short }) => ({ lineId: line.lineId, productId: line.productId, productName: line.productName, qty: short }));

    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };

    await withTransaction(async (session) => {
      if (fulfillment.reserved) {
        for (const alloc of fulfillment.allocations as any[]) {
          for (const line of alloc.lines as any[]) {
            await Stock.updateOne(
              { warehouseId: alloc.warehouseId, productId: line.productId },
              { $inc: { reserved: -line.qty, available: line.qty } },
              { session: session ?? undefined },
            );
          }
        }
      }
      for (const alloc of newAllocations) {
        for (const line of alloc.lines) {
          await Stock.updateOne(
            { warehouseId: alloc.warehouseId, productId: line.productId },
            { $inc: { reserved: line.qty, available: -line.qty } },
            { session: session ?? undefined },
          );
        }
      }
      fulfillment.allocations = newAllocations;
      fulfillment.backorders = backorders;
      fulfillment.totalShipments = newAllocations.length;
      fulfillment.totalCost = newAllocations.reduce((a, x) => a + x.estCost, 0);
      fulfillment.rationale = [
        `Manually overridden by ${actor.name}: ${body.reason}`,
        ...newAllocations.map((a) => `${a.warehouseName} carries ${a.qty} unit(s): ${a.lines.map((l: any) => `${l.productName} x${l.qty}`).join(', ')}.`),
        ...(backorders.length > 0 ? [`${backorders.reduce((a, b) => a + b.qty, 0)} unit(s) remain on backorder after the override.`] : []),
      ];
      fulfillment.reserved = true;
      fulfillment.overridden = true;
      fulfillment.overriddenBy = actor.name;
      fulfillment.overrideReason = body.reason;
      fulfillment.consolidationAvailableAt = undefined;
      fulfillment.status = backorders.length > 0 ? FulfillmentStatus.BACKORDER : FulfillmentStatus.RESERVED;
      await fulfillment.save({ session: session ?? undefined });
    });

    await writeAudit({
      actor,
      action: 'FULFILLMENT_OVERRIDDEN',
      entity: AuditEntity.FULFILLMENT,
      entityId: String(fulfillment._id),
      entityLabel: fulfillment.orderNumber,
      after: { warehouses: newAllocations.length, backorderedUnits: backorders.reduce((a, b) => a + b.qty, 0) },
      reason: body.reason,
    });

    const stock = await stockRowsFor(newAllocations.map((a) => String(a.warehouseId)), newAllocations.flatMap((a) => a.lines.map((l: any) => String(l.productId))));
    ok(res, { fulfillment: toDto(fulfillment), stock });
  }),
);

/** Ship every allocation not yet shipped: physical stock leaves, the order line's qtyShipped moves. */
fulfillmentRouter.post(
  '/:id/ship',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const fulfillment: any = await Fulfillment.findById(req.params.id);
    if (!fulfillment) throw notFound(`No fulfillment with id ${req.params.id}`);
    if (!fulfillment.reserved) throw invalidState('Accept or override the split before shipping it.');
    if ([FulfillmentStatus.SHIPPED, FulfillmentStatus.CANCELLED].includes(fulfillment.status)) {
      throw invalidState(`This fulfillment is already ${fulfillment.status}.`);
    }

    const order: any = await Order.findById(fulfillment.orderId);
    if (!order) throw notFound(`No order for fulfillment ${fulfillment._id}`);
    const now = new Date();

    await withTransaction(async (session) => {
      for (const alloc of fulfillment.allocations as any[]) {
        if (alloc.shipped) continue;
        for (const line of alloc.lines as any[]) {
          await Stock.updateOne(
            { warehouseId: alloc.warehouseId, productId: line.productId },
            { $inc: { inStock: -line.qty, reserved: -line.qty } },
            { session: session ?? undefined },
          );
          const orderLine = (order.lines as any[]).find((l) => l.lineId === line.lineId);
          if (orderLine) orderLine.qtyShipped = Math.min(orderLine.qty, orderLine.qtyShipped + line.qty);
        }
        alloc.shipped = true;
        alloc.shippedAt = now;
      }
      fulfillment.status = fulfillment.backorders.length > 0 ? FulfillmentStatus.PARTIALLY_SHIPPED : FulfillmentStatus.SHIPPED;
      await fulfillment.save({ session: session ?? undefined });

      const fullyShipped = (order.lines as any[]).filter((l) => !l.isSubscription).every((l) => l.qtyShipped >= l.qty);
      if (fullyShipped && order.status === OrderStatus.CONFIRMED) order.status = OrderStatus.SHIPPED;
      await order.save({ session: session ?? undefined });
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'FULFILLMENT_SHIPPED',
      entity: AuditEntity.FULFILLMENT,
      entityId: String(fulfillment._id),
      entityLabel: fulfillment.orderNumber,
      reason: 'Allocations marked shipped',
    });

    ok(res, { fulfillment: toDto(fulfillment), order: toDto(order) });
  }),
);

/** Read-only check — does live stock now cover the outstanding backorder? */
fulfillmentRouter.get(
  '/:id/consolidation',
  requireAuth(OPS),
  asyncHandler(async (req, res) => {
    const fulfillment: any = await Fulfillment.findById(req.params.id).lean();
    if (!fulfillment) throw notFound(`No fulfillment with id ${req.params.id}`);
    const { splitStock } = await stockAndWarehouseCatalog();
    const result = checkBackorderConsolidation(toSplitBackorders(fulfillment.backorders), splitStock);
    ok(res, result);
  }),
);

/** Consolidate the covered backorder into one shipment from the covering warehouse. */
fulfillmentRouter.post(
  '/:id/consolidate',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const fulfillment: any = await Fulfillment.findById(req.params.id);
    if (!fulfillment) throw notFound(`No fulfillment with id ${req.params.id}`);
    if (!fulfillment.consolidationAvailableAt) {
      throw invalidState('There is no covered backorder ready to consolidate.');
    }
    const { splitStock } = await stockAndWarehouseCatalog();
    const { available, coveredBy } = checkBackorderConsolidation(toSplitBackorders(fulfillment.backorders), splitStock);
    if (!available) throw invalidState('Stock no longer covers the outstanding backorder.');

    const productName = new Map((fulfillment.backorders as any[]).map((b: any) => [String(b.productId), b.productName]));
    const warehouses = await Warehouse.find({ _id: { $in: coveredBy.map((c) => c.warehouseId) } }).lean();
    const warehouseName = new Map((warehouses as any[]).map((w: any) => [String(w._id), w.name]));
    const now = new Date();

    await withTransaction(async (session) => {
      const order: any = await Order.findById(fulfillment.orderId).session(session ?? null);
      if (!order) throw notFound(`No order for fulfillment ${fulfillment._id}`);

      for (const c of coveredBy) {
        await Stock.updateOne(
          { warehouseId: c.warehouseId, productId: c.productId },
          { $inc: { inStock: -c.qty, available: -c.qty } },
          { session: session ?? undefined },
        );
        const backorder = (fulfillment.backorders as any[]).find((b: any) => String(b.productId) === c.productId);
        const existing = (fulfillment.allocations as any[]).find((a: any) => String(a.warehouseId) === c.warehouseId);
        const line = { lineId: backorder.lineId, productId: c.productId, productName: productName.get(c.productId) ?? '', qty: c.qty };
        if (existing) {
          existing.lines.push(line);
          existing.qty += c.qty;
        } else {
          fulfillment.allocations.push({
            warehouseId: c.warehouseId, warehouseName: warehouseName.get(c.warehouseId) ?? '',
            lines: [line], qty: c.qty, estShipments: 1, estCost: 0, shipped: true, shippedAt: now,
          });
        }
        const orderLine = (order.lines as any[]).find((l: any) => l.lineId === backorder.lineId);
        if (orderLine) orderLine.qtyShipped = Math.min(orderLine.qty, orderLine.qtyShipped + c.qty);
      }
      await order.save({ session: session ?? undefined });

      fulfillment.backorders = (fulfillment.backorders as any[]).filter(
        (b: any) => !coveredBy.some((c) => c.productId === String(b.productId)),
      );
      fulfillment.consolidationAvailableAt = undefined;
      fulfillment.rationale = [...fulfillment.rationale, `Consolidated the remaining backorder into one shipment on ${now.toISOString().slice(0, 10)}.`];
      fulfillment.status = fulfillment.backorders.length > 0 ? FulfillmentStatus.PARTIALLY_SHIPPED : FulfillmentStatus.SHIPPED;
      await fulfillment.save({ session: session ?? undefined });
    });

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'BACKORDER_CONSOLIDATED',
      entity: AuditEntity.FULFILLMENT,
      entityId: String(fulfillment._id),
      entityLabel: fulfillment.orderNumber,
      reason: 'Backorder consolidated into one shipment now that stock covers it',
    });

    ok(res, toDto(fulfillment));
  }),
);
