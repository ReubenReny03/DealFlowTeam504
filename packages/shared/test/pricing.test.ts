import { describe, expect, it } from 'vitest';
import {
  allocateMoney,
  computeLinePricing,
  computeMargin,
  computeQuoteTotals,
  CustomerTier,
  LineDiscountStatus,
  money,
  PriceRuleType,
  ProductCategory,
  resolveAllowedDiscount,
  resolvePriceListPrice,
  type LinePricingInput,
} from '../src/index.js';

const ceilings = {
  tierCeilings: { BRONZE: 5, SILVER: 10, GOLD: 15 },
  categoryCeilings: { HARDWARE: 15, SERVICES: 10, SUBSCRIPTION: 5 },
};

const laptop: LinePricingInput = {
  id: 'L1',
  productId: 'p-laptop',
  productName: 'Laptop Pro 14',
  category: ProductCategory.HARDWARE,
  qty: 2,
  unitPrice: money(1200),
  costPrice: money(820),
  discountPct: 12,
  taxPct: 15,
};

const setup: LinePricingInput = {
  id: 'L2',
  productId: 'p-setup',
  productName: 'Onsite Setup Service',
  category: ProductCategory.SERVICES,
  qty: 1,
  unitPrice: money(450),
  costPrice: money(180),
  discountPct: 18,
  taxPct: 15,
};

describe('resolveAllowedDiscount — the stricter ceiling always wins', () => {
  it('Gold + Hardware -> 15', () => {
    expect(resolveAllowedDiscount(CustomerTier.GOLD, ProductCategory.HARDWARE, ceilings)).toBe(15);
  });
  it('Gold + Services -> 10 (category is stricter)', () => {
    expect(resolveAllowedDiscount(CustomerTier.GOLD, ProductCategory.SERVICES, ceilings)).toBe(10);
  });
  it('Bronze + Hardware -> 5 (tier is stricter)', () => {
    expect(resolveAllowedDiscount(CustomerTier.BRONZE, ProductCategory.HARDWARE, ceilings)).toBe(5);
  });
  it('Gold + Subscription -> 5', () => {
    expect(resolveAllowedDiscount(CustomerTier.GOLD, ProductCategory.SUBSCRIPTION, ceilings)).toBe(5);
  });
});

describe('computeLinePricing', () => {
  const priced = computeLinePricing(laptop, CustomerTier.GOLD, ceilings);

  it('computes gross, discount, net and tax in integer cents', () => {
    expect(priced.lineGross).toBe(240000); // 2 x $1,200
    expect(priced.lineDiscount).toBe(28800); // 12%
    expect(priced.lineNet).toBe(211200);
    expect(priced.lineTax).toBe(31680); // 15% of the DISCOUNTED amount
    expect(priced.lineTotal).toBe(242880);
  });

  it('charges tax on the net, not the gross', () => {
    expect(priced.lineTax).toBe(Math.round(priced.lineNet * 0.15));
  });

  it('computes margin against cost', () => {
    expect(priced.lineCost).toBe(164000);
    expect(priced.lineMargin).toBe(47200);
    expect(priced.marginPct).toBeCloseTo(22.35, 1);
  });

  it('marks a within-limit line OK', () => {
    expect(priced.allowedDiscountPct).toBe(15);
    expect(priced.overByPts).toBe(0);
    expect(priced.discountStatus).toBe(LineDiscountStatus.OK);
  });

  it('marks the over-limit service line OVER (+8pt), exactly as screen 4 shows', () => {
    const s = computeLinePricing(setup, CustomerTier.GOLD, ceilings);
    expect(s.allowedDiscountPct).toBe(10);
    expect(s.overByPts).toBe(8);
    expect(s.discountStatus).toBe(LineDiscountStatus.OVER);
  });

  it('clamps a negative quantity and an out-of-range discount', () => {
    const p = computeLinePricing({ ...laptop, qty: -3, discountPct: 140 }, CustomerTier.GOLD, ceilings);
    expect(p.qty).toBe(0);
    expect(p.discountPct).toBe(100);
    expect(p.lineTotal).toBe(0);
  });
});

describe('computeQuoteTotals', () => {
  const lines = [laptop, setup].map((l) => computeLinePricing(l, CustomerTier.GOLD, ceilings));
  const totals = computeQuoteTotals(lines);

  it('sums every component', () => {
    expect(totals.subtotal).toBe(240000 + 45000);
    expect(totals.discountTotal).toBe(28800 + 8100);
    expect(totals.netTotal).toBe(211200 + 36900);
    expect(totals.grandTotal).toBe(totals.netTotal + totals.taxTotal);
  });

  it('separates one-time from recurring', () => {
    expect(totals.recurringTotal).toBe(0);
    expect(totals.oneTimeTotal).toBe(totals.grandTotal);
  });

  it('splits a hybrid cart into its two billing artefacts', () => {
    const carePlan = computeLinePricing(
      {
        id: 'L3',
        productId: 'p-care',
        productName: 'Care Plan 2yr',
        category: ProductCategory.SUBSCRIPTION,
        qty: 1,
        unitPrice: money(46),
        costPrice: money(0),
        discountPct: 0,
        taxPct: 5,
        isSubscription: true,
      },
      CustomerTier.GOLD,
      ceilings,
    );
    const hybrid = computeQuoteTotals([...lines, carePlan]);
    expect(hybrid.recurringTotal).toBe(4600 + 230);
    expect(hybrid.oneTimeTotal).toBe(totals.oneTimeTotal);
    expect(hybrid.grandTotal).toBe(hybrid.oneTimeTotal + hybrid.recurringTotal);
  });

  it('an empty quote has zero totals and no NaN margin', () => {
    const t = computeQuoteTotals([]);
    expect(t.grandTotal).toBe(0);
    expect(t.marginPct).toBe(0);
  });
});

describe('computeMargin — the live indicator on screen 4', () => {
  it('moves the moment an upsell line is added', () => {
    const base = [computeLinePricing(laptop, CustomerTier.GOLD, ceilings)];
    const before = computeMargin(base);
    const mouse = computeLinePricing(
      {
        id: 'L9',
        productId: 'p-mouse',
        productName: 'Wireless Mouse',
        category: ProductCategory.HARDWARE,
        qty: 1,
        unitPrice: money(30),
        costPrice: money(12),
        discountPct: 0,
        taxPct: 15,
      },
      CustomerTier.GOLD,
      ceilings,
    );
    const after = computeMargin([...base, mouse]);
    expect(after.marginAmount - before.marginAmount).toBe(money(18)); // "Margin +$18"
  });
});

describe('resolvePriceListPrice', () => {
  it('NONE leaves the base price alone (Bronze)', () => {
    expect(resolvePriceListPrice(money(1200), { ruleType: PriceRuleType.NONE, ruleValue: 0 }, 'p')).toBe(money(1200));
  });
  it('PERCENT_OFF_BASE applies the Gold "base minus 10 percent" rule', () => {
    expect(
      resolvePriceListPrice(money(1200), { ruleType: PriceRuleType.PERCENT_OFF_BASE, ruleValue: 10 }, 'p'),
    ).toBe(money(1080));
  });
  it('a per-product override beats the list rule', () => {
    expect(
      resolvePriceListPrice(
        money(1200),
        { ruleType: PriceRuleType.PERCENT_OFF_BASE, ruleValue: 10, entries: [{ productId: 'p', price: money(999) }] },
        'p',
      ),
    ).toBe(money(999));
  });
});

describe('money helpers', () => {
  it('never drifts on repeated percentage arithmetic', () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total += computeLinePricing(laptop, CustomerTier.GOLD, ceilings).lineTotal;
    expect(total).toBe(242880 * 1000);
    expect(Number.isInteger(total)).toBe(true);
  });

  it('allocateMoney distributes without losing or inventing a cent', () => {
    const parts = allocateMoney(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
});
