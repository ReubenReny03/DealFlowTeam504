/**
 * Warehouse split planner (PURE — no database, no reservations).
 *
 * The API wraps this: it loads live stock, calls `planWarehouseSplit`, then
 * atomically reserves what the plan says. Keeping the planner pure means the UI
 * can preview a split and the tests can pin the algorithm without a database.
 *
 * Objective, in strict priority order:
 *   1. minimise the number of shipments
 *   2. minimise weighted shipping cost
 *   3. minimise backordered quantity
 */
import type { Money } from '../util/money.js';
import type { IsoDate } from '../util/dates.js';
import { addDays, toIso } from '../util/dates.js';

export interface SplitLine {
  lineId: string;
  productId: string;
  productName: string;
  qty: number;
}

export interface SplitStock {
  warehouseId: string;
  productId: string;
  inStock: number;
  reserved: number;
  /** Optional inbound replenishment date; used for the backorder ETA. */
  incomingEta?: IsoDate;
}

export interface SplitWarehouse {
  warehouseId: string;
  name: string;
  /** Ranking weight. LOWER is preferred. */
  shippingCostWeight: number;
  baseShipmentCost: Money;
  perUnitShippingCost: Money;
  replenishmentLeadTimeDays: number;
}

export interface SplitAllocationLine {
  lineId: string;
  productId: string;
  productName: string;
  qty: number;
}

export interface SplitAllocation {
  warehouseId: string;
  warehouseName: string;
  lines: SplitAllocationLine[];
  qty: number;
  estShipments: number;
  estCost: Money;
}

export interface SplitBackorder {
  lineId: string;
  productId: string;
  productName: string;
  qty: number;
  warehouseId?: string;
  warehouseName?: string;
  etaDate?: IsoDate;
}

export interface WarehouseSplitPlan {
  allocations: SplitAllocation[];
  backorders: SplitBackorder[];
  totalShipments: number;
  totalCost: Money;
  /** Plain-English justification, shown on screen 8 so the logic is provably real. */
  rationale: string[];
}

export interface SplitPlannerOptions {
  /** "Now", for deterministic ETA computation. Defaults to the current clock. */
  now?: Date | string;
}

function availableAt(stock: SplitStock[], warehouseId: string, productId: string): number {
  const row = stock.find((s) => s.warehouseId === warehouseId && s.productId === productId);
  return row ? Math.max(0, row.inStock - row.reserved) : 0;
}

function estimateCost(w: SplitWarehouse, qty: number): Money {
  return w.baseShipmentCost + w.perUnitShippingCost * qty;
}

/**
 * Plan the split.
 *
 * Step 1: if a single warehouse can cover EVERY line completely, use it. One
 *         shipment is always better than two, whatever the per-unit cost.
 * Step 2: otherwise rank warehouses by (lines fully coverable DESC,
 *         shippingCostWeight ASC) and allocate line by line, preferring to keep
 *         a line whole in one warehouse before splitting it.
 * Step 3: whatever is left over becomes a backorder with an ETA derived from the
 *         warehouse replenishment lead time.
 */
export function planWarehouseSplit(
  lines: SplitLine[],
  stock: SplitStock[],
  warehouses: SplitWarehouse[],
  options: SplitPlannerOptions = {},
): WarehouseSplitPlan {
  const now = options.now ? new Date(options.now) : new Date();
  const rationale: string[] = [];
  const active = warehouses.filter((w) => w.shippingCostWeight > 0);
  const stockLines = lines.filter((l) => l.qty > 0);

  if (stockLines.length === 0) {
    return {
      allocations: [],
      backorders: [],
      totalShipments: 0,
      totalCost: 0,
      rationale: ['Order contains no stockable lines; nothing to fulfil from a warehouse.'],
    };
  }

  const totalUnits = stockLines.reduce((a, l) => a + l.qty, 0);

  /* ---- Step 1: single-warehouse fulfilment ---- */
  const singleCandidates = active
    .filter((w) => stockLines.every((l) => availableAt(stock, w.warehouseId, l.productId) >= l.qty))
    .sort(
      (a, b) =>
        a.shippingCostWeight - b.shippingCostWeight ||
        estimateCost(a, totalUnits) - estimateCost(b, totalUnits),
    );

  if (singleCandidates.length > 0) {
    const w = singleCandidates[0];
    const cost = estimateCost(w, totalUnits);
    rationale.push(
      `${w.name} can cover all ${stockLines.length} line(s) in full (${totalUnits} unit(s)).`,
      `Single shipment chosen: one shipment always beats two, and ${w.name} has the lowest shipping cost weight (${w.shippingCostWeight}) among the warehouses that could cover the whole order.`,
      `Estimated cost ${cost} minor units = base ${w.baseShipmentCost} + ${totalUnits} x ${w.perUnitShippingCost} per unit.`,
    );
    return {
      allocations: [
        {
          warehouseId: w.warehouseId,
          warehouseName: w.name,
          lines: stockLines.map((l) => ({
            lineId: l.lineId,
            productId: l.productId,
            productName: l.productName,
            qty: l.qty,
          })),
          qty: totalUnits,
          estShipments: 1,
          estCost: cost,
        },
      ],
      backorders: [],
      totalShipments: 1,
      totalCost: cost,
      rationale,
    };
  }

  rationale.push(
    `No single warehouse can cover the whole order (${totalUnits} unit(s) across ${stockLines.length} line(s)), so the order is being split.`,
  );

  /* ---- Step 2: greedy multi-warehouse allocation ---- */
  const remaining = new Map(stockLines.map((l) => [l.lineId, l.qty]));
  const virtualAvailable = new Map<string, number>();
  for (const w of active) {
    for (const l of stockLines) {
      virtualAvailable.set(
        `${w.warehouseId}::${l.productId}`,
        availableAt(stock, w.warehouseId, l.productId),
      );
    }
  }

  const ranked = [...active].sort((a, b) => {
    const coverA = stockLines.filter(
      (l) => (virtualAvailable.get(`${a.warehouseId}::${l.productId}`) ?? 0) >= (remaining.get(l.lineId) ?? 0),
    ).length;
    const coverB = stockLines.filter(
      (l) => (virtualAvailable.get(`${b.warehouseId}::${l.productId}`) ?? 0) >= (remaining.get(l.lineId) ?? 0),
    ).length;
    return coverB - coverA || a.shippingCostWeight - b.shippingCostWeight;
  });

  rationale.push(
    `Warehouses ranked by (lines fully coverable DESC, shipping cost weight ASC): ${ranked
      .map((w) => `${w.name} [weight ${w.shippingCostWeight}]`)
      .join(' > ')}.`,
  );

  const allocations: SplitAllocation[] = [];

  // Pass A: keep whole lines together wherever possible.
  for (const w of ranked) {
    const picked: SplitAllocationLine[] = [];
    for (const l of stockLines) {
      const need = remaining.get(l.lineId) ?? 0;
      if (need <= 0) continue;
      const key = `${w.warehouseId}::${l.productId}`;
      const avail = virtualAvailable.get(key) ?? 0;
      if (avail >= need) {
        picked.push({ lineId: l.lineId, productId: l.productId, productName: l.productName, qty: need });
        virtualAvailable.set(key, avail - need);
        remaining.set(l.lineId, 0);
      }
    }
    if (picked.length > 0) {
      pushAllocation(allocations, w, picked);
      rationale.push(
        `${w.name} takes ${picked.reduce((a, p) => a + p.qty, 0)} unit(s) as whole line(s): ${picked
          .map((p) => `${p.productName} x${p.qty}`)
          .join(', ')}.`,
      );
    }
  }

  // Pass B: split whatever is still outstanding across the remaining capacity.
  for (const w of ranked) {
    const picked: SplitAllocationLine[] = [];
    for (const l of stockLines) {
      const need = remaining.get(l.lineId) ?? 0;
      if (need <= 0) continue;
      const key = `${w.warehouseId}::${l.productId}`;
      const avail = virtualAvailable.get(key) ?? 0;
      const take = Math.min(avail, need);
      if (take > 0) {
        picked.push({ lineId: l.lineId, productId: l.productId, productName: l.productName, qty: take });
        virtualAvailable.set(key, avail - take);
        remaining.set(l.lineId, need - take);
      }
    }
    if (picked.length > 0) {
      pushAllocation(allocations, w, picked);
      rationale.push(
        `${w.name} covers a partial remainder of ${picked.reduce((a, p) => a + p.qty, 0)} unit(s): ${picked
          .map((p) => `${p.productName} x${p.qty}`)
          .join(', ')}.`,
      );
    }
  }

  /* ---- Step 3: backorders ---- */
  const backorders: SplitBackorder[] = [];
  for (const l of stockLines) {
    const short = remaining.get(l.lineId) ?? 0;
    if (short <= 0) continue;
    // ETA comes from whichever warehouse restocks this product soonest.
    const candidates = active
      .map((w) => {
        const row = stock.find(
          (s) => s.warehouseId === w.warehouseId && s.productId === l.productId,
        );
        const eta = row?.incomingEta
          ? new Date(row.incomingEta)
          : addDays(now, w.replenishmentLeadTimeDays);
        return { w, eta };
      })
      .sort((a, b) => a.eta.getTime() - b.eta.getTime());
    const best = candidates[0];
    backorders.push({
      lineId: l.lineId,
      productId: l.productId,
      productName: l.productName,
      qty: short,
      warehouseId: best?.w.warehouseId,
      warehouseName: best?.w.name,
      etaDate: best ? toIso(best.eta) : undefined,
    });
    rationale.push(
      `${short} unit(s) of ${l.productName} cannot be covered from live stock and go on backorder${
        best ? `, expected at ${best.w.name} around ${toIso(best.eta).slice(0, 10)}` : ''
      }.`,
    );
  }

  const totalShipments = allocations.reduce((a, x) => a + x.estShipments, 0);
  const totalCost = allocations.reduce((a, x) => a + x.estCost, 0);
  rationale.push(
    `Final plan: ${allocations.length} warehouse(s), ${totalShipments} shipment(s), estimated cost ${totalCost} minor units, ${backorders.reduce(
      (a, b) => a + b.qty,
      0,
    )} unit(s) on backorder.`,
  );

  return { allocations, backorders, totalShipments, totalCost, rationale };
}

function pushAllocation(
  allocations: SplitAllocation[],
  w: SplitWarehouse,
  picked: SplitAllocationLine[],
): void {
  const existing = allocations.find((a) => a.warehouseId === w.warehouseId);
  if (existing) {
    for (const p of picked) {
      const line = existing.lines.find((x) => x.lineId === p.lineId);
      if (line) line.qty += p.qty;
      else existing.lines.push({ ...p });
    }
    existing.qty = existing.lines.reduce((a, x) => a + x.qty, 0);
    existing.estCost = estimateCost(w, existing.qty);
    return;
  }
  const qty = picked.reduce((a, p) => a + p.qty, 0);
  allocations.push({
    warehouseId: w.warehouseId,
    warehouseName: w.name,
    lines: picked.map((p) => ({ ...p })),
    qty,
    estShipments: 1,
    estCost: estimateCost(w, qty),
  });
}

/**
 * Does a restock now cover the outstanding backorder?
 * Drives the "Consolidate Remaining Backorder" auto-prompt on screen 8.
 */
export function checkBackorderConsolidation(
  backorders: SplitBackorder[],
  stock: SplitStock[],
): { available: boolean; coveredBy: { productId: string; warehouseId: string; qty: number }[] } {
  const coveredBy: { productId: string; warehouseId: string; qty: number }[] = [];
  for (const b of backorders) {
    const source = stock.find(
      (s) => s.productId === b.productId && s.inStock - s.reserved >= b.qty,
    );
    if (source) coveredBy.push({ productId: b.productId, warehouseId: source.warehouseId, qty: b.qty });
  }
  return { available: backorders.length > 0 && coveredBy.length === backorders.length, coveredBy };
}
