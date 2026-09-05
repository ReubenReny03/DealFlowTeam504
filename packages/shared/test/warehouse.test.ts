import { describe, expect, it } from 'vitest';
import {
  checkBackorderConsolidation,
  money,
  planWarehouseSplit,
  type SplitLine,
  type SplitStock,
  type SplitWarehouse,
} from '../src/index.js';

/** Seeded warehouses. Main is preferred (lower weight); East Depot costs more to ship from. */
const MAIN: SplitWarehouse = {
  warehouseId: 'wh-main',
  name: 'Main Warehouse',
  shippingCostWeight: 1.0,
  baseShipmentCost: money(24),
  perUnitShippingCost: money(1),
  replenishmentLeadTimeDays: 5,
};
const EAST: SplitWarehouse = {
  warehouseId: 'wh-east',
  name: 'East Depot',
  shippingCostWeight: 1.4,
  baseShipmentCost: money(20),
  perUnitShippingCost: money(1),
  replenishmentLeadTimeDays: 9,
};

const LAPTOP = 'p-laptop';
const NOW = '2026-09-05T00:00:00.000Z';

describe('planWarehouseSplit — single warehouse wins whenever it can', () => {
  it('uses one shipment when one warehouse covers the whole order', () => {
    const lines: SplitLine[] = [{ lineId: 'L1', productId: LAPTOP, productName: 'Laptop Pro 14', qty: 5 }];
    const stock: SplitStock[] = [
      { warehouseId: 'wh-main', productId: LAPTOP, inStock: 40, reserved: 22 },
      { warehouseId: 'wh-east', productId: LAPTOP, inStock: 10, reserved: 4 },
    ];
    const plan = planWarehouseSplit(lines, stock, [MAIN, EAST], { now: NOW });
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].warehouseName).toBe('Main Warehouse');
    expect(plan.totalShipments).toBe(1);
    expect(plan.backorders).toHaveLength(0);
    expect(plan.rationale.length).toBeGreaterThan(0);
  });

  it('prefers the lower shipping cost weight when both could cover it', () => {
    const lines: SplitLine[] = [{ lineId: 'L1', productId: LAPTOP, productName: 'Laptop Pro 14', qty: 2 }];
    const stock: SplitStock[] = [
      { warehouseId: 'wh-main', productId: LAPTOP, inStock: 40, reserved: 0 },
      { warehouseId: 'wh-east', productId: LAPTOP, inStock: 40, reserved: 0 },
    ];
    const plan = planWarehouseSplit(lines, stock, [MAIN, EAST], { now: NOW });
    expect(plan.allocations[0].warehouseId).toBe('wh-main');
  });
});

describe('planWarehouseSplit — the Q-1042 demo split (screen 8)', () => {
  // Main has 18 available (40 in stock, 22 reserved by other orders),
  // East Depot has 6 available (10 in stock, 4 reserved). The order needs 24.
  const lines: SplitLine[] = [{ lineId: 'L1', productId: LAPTOP, productName: 'Laptop Pro 14', qty: 24 }];
  const stock: SplitStock[] = [
    { warehouseId: 'wh-main', productId: LAPTOP, inStock: 40, reserved: 22 },
    { warehouseId: 'wh-east', productId: LAPTOP, inStock: 10, reserved: 4 },
  ];
  const plan = planWarehouseSplit(lines, stock, [MAIN, EAST], { now: NOW });

  it('splits 18 units from Main Warehouse and 6 from East Depot', () => {
    const main = plan.allocations.find((a) => a.warehouseId === 'wh-main');
    const east = plan.allocations.find((a) => a.warehouseId === 'wh-east');
    expect(main?.qty).toBe(18);
    expect(east?.qty).toBe(6);
  });

  it('estimates 1 shipment each, $42 and $26 — exactly the mockup figures', () => {
    const main = plan.allocations.find((a) => a.warehouseId === 'wh-main')!;
    const east = plan.allocations.find((a) => a.warehouseId === 'wh-east')!;
    expect(main.estShipments).toBe(1);
    expect(east.estShipments).toBe(1);
    expect(main.estCost).toBe(money(42)); // $24 base + 18 x $1
    expect(east.estCost).toBe(money(26)); // $20 base + 6 x $1
    expect(plan.totalShipments).toBe(2);
    expect(plan.totalCost).toBe(money(68));
  });

  it('leaves nothing on backorder', () => {
    expect(plan.backorders).toHaveLength(0);
  });

  it('explains itself — rationale is never empty and names both warehouses', () => {
    const text = plan.rationale.join(' ');
    expect(text).toContain('Main Warehouse');
    expect(text).toContain('East Depot');
    expect(text).toContain('ranked by');
  });
});

describe('planWarehouseSplit — backorders', () => {
  const lines: SplitLine[] = [{ lineId: 'L1', productId: LAPTOP, productName: 'Laptop Pro 14', qty: 30 }];
  const stock: SplitStock[] = [
    { warehouseId: 'wh-main', productId: LAPTOP, inStock: 40, reserved: 22 },
    { warehouseId: 'wh-east', productId: LAPTOP, inStock: 10, reserved: 4 },
  ];
  const plan = planWarehouseSplit(lines, stock, [MAIN, EAST], { now: NOW });

  it('allocates everything available and backorders the shortfall', () => {
    expect(plan.allocations.reduce((a, x) => a + x.qty, 0)).toBe(24);
    expect(plan.backorders).toHaveLength(1);
    expect(plan.backorders[0].qty).toBe(6);
  });

  it('gives the backorder an ETA from the fastest replenishing warehouse', () => {
    // Main restocks in 5 days, East in 9. The ETA must be Main's.
    expect(plan.backorders[0].warehouseName).toBe('Main Warehouse');
    expect(plan.backorders[0].etaDate?.slice(0, 10)).toBe('2026-09-10');
  });

  it('prefers an explicit incoming ETA over the lead-time estimate', () => {
    const withEta: SplitStock[] = [
      { warehouseId: 'wh-main', productId: LAPTOP, inStock: 40, reserved: 22 },
      { warehouseId: 'wh-east', productId: LAPTOP, inStock: 10, reserved: 4, incomingEta: '2026-09-07T00:00:00.000Z' },
    ];
    const p = planWarehouseSplit(lines, withEta, [MAIN, EAST], { now: NOW });
    expect(p.backorders[0].warehouseName).toBe('East Depot');
    expect(p.backorders[0].etaDate?.slice(0, 10)).toBe('2026-09-07');
  });
});

describe('planWarehouseSplit — multi-line behaviour', () => {
  it('keeps a line whole in one warehouse before splitting it', () => {
    const DOCK = 'p-dock';
    const lines: SplitLine[] = [
      { lineId: 'L1', productId: LAPTOP, productName: 'Laptop Pro 14', qty: 24 },
      { lineId: 'L2', productId: DOCK, productName: 'Docking Station', qty: 4 },
    ];
    const stock: SplitStock[] = [
      { warehouseId: 'wh-main', productId: LAPTOP, inStock: 40, reserved: 22 },
      { warehouseId: 'wh-main', productId: DOCK, inStock: 65, reserved: 12 },
      { warehouseId: 'wh-east', productId: LAPTOP, inStock: 10, reserved: 4 },
      { warehouseId: 'wh-east', productId: DOCK, inStock: 0, reserved: 0 },
    ];
    const plan = planWarehouseSplit(lines, stock, [MAIN, EAST], { now: NOW });
    const main = plan.allocations.find((a) => a.warehouseId === 'wh-main')!;
    // Docking Station fits entirely in Main, so it is never split.
    expect(main.lines.find((l) => l.productId === DOCK)?.qty).toBe(4);
    expect(plan.allocations.find((a) => a.warehouseId === 'wh-east')!.lines).toHaveLength(1);
  });

  it('handles an order with no stockable lines', () => {
    const plan = planWarehouseSplit([], [], [MAIN, EAST], { now: NOW });
    expect(plan.allocations).toHaveLength(0);
    expect(plan.rationale[0]).toContain('nothing to fulfil');
  });
});

describe('checkBackorderConsolidation — screen 8 auto-prompt', () => {
  const backorders = [{ lineId: 'L1', productId: LAPTOP, productName: 'Laptop Pro 14', qty: 6 }];

  it('stays unavailable while East Depot is still short', () => {
    const stock: SplitStock[] = [{ warehouseId: 'wh-east', productId: LAPTOP, inStock: 4, reserved: 0 }];
    expect(checkBackorderConsolidation(backorders, stock).available).toBe(false);
  });

  it('flips to available the moment a restock covers the shortfall', () => {
    const stock: SplitStock[] = [{ warehouseId: 'wh-east', productId: LAPTOP, inStock: 20, reserved: 0 }];
    const result = checkBackorderConsolidation(backorders, stock);
    expect(result.available).toBe(true);
    expect(result.coveredBy[0]).toEqual({ productId: LAPTOP, warehouseId: 'wh-east', qty: 6 });
  });

  it('is never available when there is nothing on backorder', () => {
    expect(checkBackorderConsolidation([], []).available).toBe(false);
  });
});
