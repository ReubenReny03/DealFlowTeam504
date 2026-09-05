import { describe, expect, it } from 'vitest';
import {
  averageDiscountPct,
  detectDeliverySlippage,
  detectDiscountAnomalies,
  detectStalledDeals,
  evaluateDealHealth,
  money,
  ProductCategory,
  QuoteStage,
  rankUpsells,
  type DealHealthQuote,
  type UpsellCandidate,
} from '../src/index.js';

const MOUSE: UpsellCandidate = {
  productId: 'p-mouse', name: 'Wireless Mouse', sku: 'WM-001', category: ProductCategory.HARDWARE,
  unitPrice: money(30), costPrice: money(12), promoted: false, coPurchaseFrequency: 0.78,
  pairedWithName: 'Laptop Pro 14',
};
const DOCK: UpsellCandidate = {
  productId: 'p-dock', name: 'Docking Station', sku: 'DS-001', category: ProductCategory.HARDWARE,
  unitPrice: money(180), costPrice: money(140), promoted: true, promoTag: 'Promo, 12% off',
  coPurchaseFrequency: 0.41, pairedWithName: 'Laptop Pro 14',
};
const CARE: UpsellCandidate = {
  productId: 'p-care', name: 'Care Plan 2yr', sku: 'CP-2Y', category: ProductCategory.SUBSCRIPTION,
  unitPrice: money(46), costPrice: money(0), promoted: false, coPurchaseFrequency: 0.62,
  pairedWithName: 'Laptop Pro 14',
};

describe('rankUpsells', () => {
  it('returns the three mockup suggestions with their margin deltas', () => {
    const out = rankUpsells(['p-laptop'], [MOUSE, DOCK, CARE]);
    expect(out).toHaveLength(3);
    const byId = Object.fromEntries(out.map((o) => [o.productId, o]));
    expect(byId['p-mouse'].marginDelta).toBe(money(18)); // "Margin +$18"
    expect(byId['p-care'].marginDelta).toBe(money(46)); // "Margin +$46"
    expect(byId['p-dock'].promoTag).toBe('Promo, 12% off');
  });

  it('never suggests something already in the cart', () => {
    const out = rankUpsells(['p-laptop', 'p-mouse'], [MOUSE, DOCK, CARE]);
    expect(out.some((o) => o.productId === 'p-mouse')).toBe(false);
  });

  it('filters out suggestions below the minimum margin threshold', () => {
    const out = rankUpsells(['p-laptop'], [MOUSE, DOCK, CARE], { minMarginThreshold: money(45) });
    expect(out.map((o) => o.productId)).toEqual(['p-care']);
  });

  it('ranks a promoted product above an equal non-promoted one', () => {
    const plain: UpsellCandidate = { ...DOCK, productId: 'p-plain', name: 'Plain Dock', promoted: false, promoTag: undefined };
    const out = rankUpsells(['p-laptop'], [plain, DOCK]);
    expect(out[0].productId).toBe('p-dock');
  });

  it('respects maxSuggestions', () => {
    expect(rankUpsells(['p-laptop'], [MOUSE, DOCK, CARE], { maxSuggestions: 2 })).toHaveLength(2);
  });

  it('explains every suggestion in plain language', () => {
    const out = rankUpsells(['p-laptop'], [MOUSE]);
    expect(out[0].reason).toContain('Laptop Pro 14');
    expect(out[0].reason).toContain('78%');
  });

  it('returns an empty list when there is nothing eligible', () => {
    expect(rankUpsells(['p-mouse', 'p-dock', 'p-care'], [MOUSE, DOCK, CARE])).toEqual([]);
  });
});

const NOW = '2026-09-05T00:00:00.000Z';
const base: DealHealthQuote = {
  quotationId: 'q1', quotationNumber: 'Q-1030', customerId: 'c-zenith', customerName: 'Zenith Co',
  ownerId: 'u-rao', ownerName: 'J. Rao', stage: QuoteStage.PENDING_APPROVAL,
  lastActivityAt: '2026-08-27T00:00:00.000Z', avgDiscountPct: 8,
};

describe('detectStalledDeals', () => {
  it('flags Q-1030 as idle 9 days', () => {
    const out = detectStalledDeals([base], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].issue).toBe('idle 9 days');
    expect(out[0].entityLabel).toBe('Q-1030');
  });

  it('does not flag a deal inside the 7-day window', () => {
    expect(detectStalledDeals([{ ...base, lastActivityAt: '2026-09-01T00:00:00.000Z' }], NOW)).toHaveLength(0);
  });

  it('ignores finished deals however old they are', () => {
    expect(detectStalledDeals([{ ...base, stage: QuoteStage.CONFIRMED }], NOW)).toHaveLength(0);
    expect(detectStalledDeals([{ ...base, stage: QuoteStage.REJECTED }], NOW)).toHaveLength(0);
  });

  it('escalates severity past double the threshold', () => {
    expect(detectStalledDeals([{ ...base, lastActivityAt: '2026-08-01T00:00:00.000Z' }], NOW)[0].severity).toBe('HIGH');
  });
});

describe('detectDiscountAnomalies', () => {
  const delta: DealHealthQuote = {
    ...base, quotationId: 'q2', quotationNumber: 'Q-1044', customerId: 'c-delta',
    customerName: 'Delta LLC', avgDiscountPct: 32,
  };

  it('flags Delta LLC at 32% against the rep 8% average', () => {
    const out = detectDiscountAnomalies([delta], { 'u-rao': 8 });
    expect(out).toHaveLength(1);
    expect(out[0].issue).toBe('discount 32% vs avg 8%');
    expect(out[0].entityLabel).toBe('Delta LLC');
    expect(out[0].severity).toBe('HIGH'); // also above the absolute cap
  });

  it('compares against the OWNING rep, not a global average', () => {
    // S. Nair habitually discounts 20%, so the same 32% is only 1.6x their norm
    // and stays under the multiplier — but still trips the absolute cap.
    const nair = { ...delta, ownerId: 'u-nair', ownerName: 'S. Nair' };
    const out = detectDiscountAnomalies([nair], { 'u-nair': 20 });
    expect(out).toHaveLength(1);
    const under = detectDiscountAnomalies([{ ...nair, avgDiscountPct: 24 }], { 'u-nair': 20 });
    expect(under).toHaveLength(0);
  });

  it('does not flag a normal discount', () => {
    expect(detectDiscountAnomalies([{ ...base, avgDiscountPct: 9 }], { 'u-rao': 8 })).toHaveLength(0);
  });
});

describe('detectDeliverySlippage', () => {
  it('flags a projected date later than the promise', () => {
    const out = detectDeliverySlippage([
      { ...base, promisedDeliveryDate: '2026-09-10T00:00:00.000Z', projectedDeliveryDate: '2026-09-18T00:00:00.000Z' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].issue).toBe('delivery 8 day(s) late');
    expect(out[0].severity).toBe('HIGH');
  });

  it('does not flag an on-time projection', () => {
    expect(detectDeliverySlippage([
      { ...base, promisedDeliveryDate: '2026-09-20T00:00:00.000Z', projectedDeliveryDate: '2026-09-18T00:00:00.000Z' },
    ])).toHaveLength(0);
  });

  it('ignores a deal with no promise date', () => {
    expect(detectDeliverySlippage([base])).toHaveLength(0);
  });
});

describe('evaluateDealHealth + averageDiscountPct', () => {
  it('returns findings from all three rules together', () => {
    const out = evaluateDealHealth(
      [{ ...base, avgDiscountPct: 32, promisedDeliveryDate: '2026-09-01T00:00:00.000Z', projectedDeliveryDate: '2026-09-12T00:00:00.000Z' }],
      { 'u-rao': 8 },
      NOW,
    );
    expect(out.map((f) => f.type).sort()).toEqual(['DELIVERY_SLIPPAGE', 'DISCOUNT_ANOMALY', 'STALLED_DEAL']);
  });

  it('weights the average discount by revenue, not by line count', () => {
    // One tiny line at 50% must not drag a large clean line's average up much.
    expect(averageDiscountPct([{ lineGross: 240000, discountPct: 0 }, { lineGross: 1000, discountPct: 50 }])).toBeCloseTo(0.21, 2);
    expect(averageDiscountPct([])).toBe(0);
  });
});
