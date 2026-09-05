/**
 * Shared between `orders.service.ts` (the very first plan, run at confirm
 * time) and `fulfillment.routes.ts`'s `POST /plan/:orderId` (a re-plan before
 * acceptance). Keeping this in one place means the split an order gets at
 * confirm is computed by the exact same code a later re-plan would produce.
 */
import { FulfillmentStatus, planWarehouseSplit, type SplitBackorder, type SplitStock, type SplitWarehouse } from '@dealflow/shared';
import { Stock, Warehouse } from '../../db/models.js';

/**
 * `checkBackorderConsolidation` compares ids with `===`, so a Mongoose
 * subdocument's `productId` (an ObjectId, even after `.lean()`) must be
 * stringified before it is compared against `SplitStock.productId` — never
 * pass a raw embedded `backorders` array to it directly.
 */
export function toSplitBackorders(backorders: any[]): SplitBackorder[] {
  return backorders.map((b) => ({
    lineId: b.lineId,
    productId: String(b.productId),
    productName: b.productName,
    qty: b.qty,
    warehouseId: b.warehouseId ? String(b.warehouseId) : undefined,
    warehouseName: b.warehouseName,
    etaDate: b.etaDate ? new Date(b.etaDate).toISOString() : undefined,
  }));
}

export async function stockAndWarehouseCatalog() {
  const [stock, warehouses] = await Promise.all([Stock.find().lean(), Warehouse.find({ active: true }).lean()]);
  const splitStock: SplitStock[] = (stock as any[]).map((s) => ({
    warehouseId: String(s.warehouseId), productId: String(s.productId),
    inStock: s.inStock, reserved: s.reserved, incomingEta: s.incomingEta?.toISOString(),
  }));
  const splitWarehouses: SplitWarehouse[] = (warehouses as any[]).map((w) => ({
    warehouseId: String(w._id), name: w.name,
    shippingCostWeight: w.shippingCostWeight, baseShipmentCost: w.baseShipmentCost,
    perUnitShippingCost: w.perUnitShippingCost, replenishmentLeadTimeDays: w.replenishmentRule.leadTimeDays,
  }));
  return { stock, warehouses, splitStock, splitWarehouses };
}

/** Plans a fresh split for `orderLines` (already filtered to stockable, non-subscription lines) and mutates `fulfillment` in place. Does not save. */
export async function planAndApply(fulfillment: any, orderLines: any[]): Promise<void> {
  const { splitStock, splitWarehouses } = await stockAndWarehouseCatalog();
  const plan = planWarehouseSplit(
    orderLines.map((l) => ({ lineId: l.lineId, productId: String(l.productId), productName: l.productName, qty: l.qty })),
    splitStock,
    splitWarehouses,
  );
  fulfillment.allocations = plan.allocations.map((a) => ({ ...a, shipped: false }));
  fulfillment.backorders = plan.backorders;
  fulfillment.totalShipments = plan.totalShipments;
  fulfillment.totalCost = plan.totalCost;
  fulfillment.rationale = plan.rationale;
  fulfillment.status = plan.backorders.length > 0 ? FulfillmentStatus.BACKORDER : FulfillmentStatus.SPLIT_PENDING;
  fulfillment.reserved = false;
  fulfillment.overridden = false;
  fulfillment.overriddenBy = undefined;
  fulfillment.overrideReason = undefined;
  fulfillment.consolidationAvailableAt = undefined;
}
