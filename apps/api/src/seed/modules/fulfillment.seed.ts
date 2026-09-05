/**
 * Orders and their fulfillment plans (screens 7 and 8).
 * The allocations are produced by the REAL planner (`planWarehouseSplit`) against
 * the seeded stock, then the reservations are written back — exactly what the
 * running app does when a quotation is confirmed.
 */
import {
  FulfillmentStatus,
  OrderStatus,
  planWarehouseSplit,
  type SplitStock,
  type SplitWarehouse,
} from '@dealflow/shared';
import { Fulfillment, Order, Quotation, Stock, Warehouse } from '../../db/models.js';
import { G, IDS, fid } from '../ids.js';
import type { SeedContext } from '../context.js';

export async function seedOrdersAndFulfillment(ctx: SeedContext): Promise<void> {
  const [q1041, q1032, q1036]: any[] = await Promise.all([
    Quotation.findOne({ number: 'Q-1041' }).lean(),
    Quotation.findOne({ number: 'Q-1032' }).lean(),
    Quotation.findOne({ number: 'Q-1036' }).lean(),
  ]);

  const orderLines = (q: any, shippedAll: boolean) =>
    q.lines.map((l: any) => ({
      lineId: l.lineId, productId: l.productId, productName: l.productName, category: l.category,
      qty: l.qty,
      qtyShipped: shippedAll && !l.isSubscription ? l.qty : 0,
      qtyInvoiced: 0,
      unitPrice: l.unitPrice, discountPct: l.discountPct, taxPct: l.taxPct,
      lineNet: l.lineNet, lineTax: l.lineTax, lineTotal: l.lineTotal,
      isSubscription: l.isSubscription, recurringCycle: l.recurringCycle,
    }));

  await Order.insertMany([
    {
      _id: IDS.orders.acmePrior, number: 'ORD-1041',
      quotationId: q1041!._id, quotationNumber: 'Q-1041',
      customerId: IDS.customers.acme, customerName: 'Acme Corp', ownerId: IDS.users.rao,
      currency: 'USD', status: OrderStatus.INVOICED,
      lines: orderLines(q1041, true), totals: (q1041 as any).totals,
      confirmedAt: ctx.daysAgo(30), promisedDeliveryDate: ctx.daysAgo(20),
      projectedDeliveryDate: ctx.daysAgo(22), fulfillmentId: fid(G.FULFILLMENT, 1),
      createdAt: ctx.daysAgo(30), updatedAt: ctx.daysAgo(22),
    },
    {
      _id: IDS.orders.zenith, number: 'ORD-1032',
      quotationId: q1032!._id, quotationNumber: 'Q-1032',
      customerId: IDS.customers.zenith, customerName: 'Zenith Co', ownerId: IDS.users.rao,
      currency: 'USD', status: OrderStatus.CONFIRMED,
      lines: orderLines(q1032, false), totals: (q1032 as any).totals,
      confirmedAt: ctx.daysAgo(8), promisedDeliveryDate: ctx.daysAhead(3),
      projectedDeliveryDate: ctx.daysAhead(5), fulfillmentId: fid(G.FULFILLMENT, 2),
      createdAt: ctx.daysAgo(8), updatedAt: ctx.daysAgo(8),
    },
    {
      _id: IDS.orders.novus, number: 'ORD-1036',
      quotationId: q1036!._id, quotationNumber: 'Q-1036',
      customerId: IDS.customers.novus, customerName: 'Novus Retail', ownerId: IDS.users.nair,
      currency: 'USD', status: OrderStatus.PAID,
      lines: orderLines(q1036, true), totals: (q1036 as any).totals,
      confirmedAt: ctx.daysAgo(28), promisedDeliveryDate: ctx.daysAgo(18),
      projectedDeliveryDate: ctx.daysAgo(20), fulfillmentId: fid(G.FULFILLMENT, 3),
      createdAt: ctx.daysAgo(28), updatedAt: ctx.daysAgo(18),
    },
  ]);

  /* ---- Run the real planner for the Zenith backorder showcase ---- */
  const warehouses = await Warehouse.find().lean();
  const stock = await Stock.find().lean();
  const toSplitWarehouse = (w: any): SplitWarehouse => ({
    warehouseId: String(w._id), name: w.name,
    shippingCostWeight: w.shippingCostWeight,
    baseShipmentCost: w.baseShipmentCost, perUnitShippingCost: w.perUnitShippingCost,
    replenishmentLeadTimeDays: w.replenishmentRule.leadTimeDays,
  });
  const toSplitStock = (s: any): SplitStock => ({
    warehouseId: String(s.warehouseId), productId: String(s.productId),
    inStock: s.inStock, reserved: s.reserved,
  });

  const zenithPlan = planWarehouseSplit(
    (q1032 as any).lines
      .filter((l: any) => !l.isSubscription)
      .map((l: any) => ({ lineId: l.lineId, productId: String(l.productId), productName: l.productName, qty: l.qty })),
    stock.map(toSplitStock),
    warehouses.map(toSplitWarehouse),
    { now: ctx.daysAgo(8) },
  );

  await Fulfillment.insertMany([
    {
      _id: fid(G.FULFILLMENT, 1), orderId: IDS.orders.acmePrior, orderNumber: 'ORD-1041',
      customerId: IDS.customers.acme, customerName: 'Acme Corp',
      status: FulfillmentStatus.SHIPPED,
      allocations: [
        {
          warehouseId: IDS.warehouses.main, warehouseName: 'Main Warehouse',
          lines: (q1041 as any).lines.filter((l: any) => !l.isSubscription).map((l: any) => ({ lineId: l.lineId, productId: l.productId, productName: l.productName, qty: l.qty })),
          qty: (q1041 as any).lines.filter((l: any) => !l.isSubscription).reduce((a: number, l: any) => a + l.qty, 0),
          estShipments: 1, estCost: 2700, shipped: true, shippedAt: ctx.daysAgo(22),
        },
      ],
      backorders: [], totalShipments: 1, totalCost: 2700,
      rationale: [
        'Main Warehouse could cover every line in full, so a single shipment was used.',
        'One shipment always beats two, and Main Warehouse has the lowest shipping cost weight (1).',
      ],
      // Shipped orders' allocations are, by definition, already committed against stock.
      reserved: true, overridden: false,
      createdAt: ctx.daysAgo(30), updatedAt: ctx.daysAgo(22),
    },
    {
      _id: fid(G.FULFILLMENT, 2), orderId: IDS.orders.zenith, orderNumber: 'ORD-1032',
      customerId: IDS.customers.zenith, customerName: 'Zenith Co',
      status: zenithPlan.backorders.length > 0 ? FulfillmentStatus.BACKORDER : FulfillmentStatus.SPLIT_PENDING,
      allocations: zenithPlan.allocations.map((a) => ({
        warehouseId: a.warehouseId, warehouseName: a.warehouseName,
        lines: a.lines, qty: a.qty, estShipments: a.estShipments, estCost: a.estCost, shipped: false,
      })),
      backorders: zenithPlan.backorders,
      totalShipments: zenithPlan.totalShipments, totalCost: zenithPlan.totalCost,
      rationale: zenithPlan.rationale,
      // The reservations for the allocated portion are written back to stock
      // below, exactly as `POST /fulfillment/:id/accept` would — so this
      // fulfillment must be flagged `reserved` too, or a later override
      // wouldn't know to release them first before re-allocating.
      reserved: true, overridden: false,
      createdAt: ctx.daysAgo(8), updatedAt: ctx.daysAgo(8),
    },
    {
      _id: fid(G.FULFILLMENT, 3), orderId: IDS.orders.novus, orderNumber: 'ORD-1036',
      customerId: IDS.customers.novus, customerName: 'Novus Retail',
      status: FulfillmentStatus.SHIPPED,
      allocations: [
        {
          warehouseId: IDS.warehouses.main, warehouseName: 'Main Warehouse',
          lines: (q1036 as any).lines.map((l: any) => ({ lineId: l.lineId, productId: l.productId, productName: l.productName, qty: l.qty })),
          qty: (q1036 as any).lines.reduce((a: number, l: any) => a + l.qty, 0),
          estShipments: 1, estCost: 4500, shipped: true, shippedAt: ctx.daysAgo(20),
        },
      ],
      backorders: [], totalShipments: 1, totalCost: 4500,
      rationale: ['Main Warehouse could cover every line in full, so a single shipment was used.'],
      reserved: true, overridden: false,
      createdAt: ctx.daysAgo(28), updatedAt: ctx.daysAgo(20),
    },
  ]);

  /* ---- Write the Zenith reservations back, so screen 7's stock reflects them. ---- */
  for (const alloc of zenithPlan.allocations) {
    for (const line of alloc.lines) {
      await Stock.updateOne(
        { warehouseId: alloc.warehouseId, productId: line.productId },
        { $inc: { reserved: line.qty, available: -line.qty } },
      );
    }
  }
}
