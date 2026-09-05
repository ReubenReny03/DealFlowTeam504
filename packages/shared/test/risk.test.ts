import { describe, expect, it } from 'vitest';
import {
  calculateBlendedRisk,
  CustomerTier,
  DEFAULT_CHAINS,
  isAutoApproved,
  LineDiscountStatus,
  ProductCategory,
  resolveApprovalChain,
  resolveRiskLevel,
  RiskLevel,
  Role,
  money,
  type RiskConfig,
  type RiskLineInput,
} from '../src/index.js';

/** Screen 18's seeded configuration. Everything below is driven from this. */
const config: RiskConfig = {
  tierCeilings: { BRONZE: 5, SILVER: 10, GOLD: 15 },
  categoryCeilings: { HARDWARE: 15, SERVICES: 10, SUBSCRIPTION: 5 },
};

describe('calculateBlendedRisk — the PDF worked example (Q-1042)', () => {
  const lines: RiskLineInput[] = [
    {
      id: 'L1',
      productName: 'Laptop Pro 14',
      category: ProductCategory.HARDWARE,
      qty: 2,
      unitPrice: money(1200),
      discountPct: 12,
    },
    {
      id: 'L2',
      productName: 'Onsite Setup Service',
      category: ProductCategory.SERVICES,
      qty: 1,
      unitPrice: money(450),
      discountPct: 18,
    },
  ];

  const result = calculateBlendedRisk(lines, CustomerTier.GOLD, config);

  it('resolves the stricter of tier and category ceiling per line', () => {
    // Gold allows 15. Hardware allows 15 -> 15. Services allows 10 -> 10 wins.
    expect(result.explanation[0].allowed).toBe(15);
    expect(result.explanation[1].allowed).toBe(10);
  });

  it('computes per-line overage in percentage points', () => {
    expect(result.explanation[0].overBy).toBe(0);
    expect(result.explanation[1].overBy).toBe(8);
  });

  it('marks exactly the service line as OVER', () => {
    expect(result.explanation[0].status).toBe(LineDiscountStatus.OK);
    expect(result.explanation[1].status).toBe(LineDiscountStatus.OVER);
  });

  it('computes the revenue-weighted blended overage: (2400*0 + 450*8)/2850 = 1.26', () => {
    expect(result.blendedOverPct).toBeCloseTo(1.26, 2);
  });

  it('computes maxSingleOver = 8', () => {
    expect(result.maxSingleOver).toBe(8);
  });

  it('produces riskScore 33 — round(1.2631*7 + 8*3) = round(32.842)', () => {
    expect(result.riskScore).toBe(33);
  });

  it('routes to HIGH -> [SALES_MANAGER, FINANCE], exactly as screen 6 shows', () => {
    expect(result.riskLevel).toBe(RiskLevel.HIGH);
    expect(result.requiredChain).toEqual([Role.SALES_MANAGER, Role.FINANCE]);
    expect(isAutoApproved(result)).toBe(false);
  });

  it('always returns a human-readable explanation for screen 6 to render', () => {
    expect(result.explanation).toHaveLength(2);
    expect(result.summary).toContain('Onsite Setup Service');
    expect(result.summary).toContain('8 points over');
  });

  it('snapshots the ceilings it used, so the assessment stays explainable later', () => {
    expect(result.ceilingsUsed.tier).toBe(CustomerTier.GOLD);
    expect(result.ceilingsUsed.tierCeiling).toBe(15);
    expect(result.ceilingsUsed.categoryCeilings.SERVICES).toBe(10);
  });
});

describe('calculateBlendedRisk — death by a thousand cuts', () => {
  // Three equally-weighted lines, each only 2-3 points over. No single line looks
  // alarming, but the pattern across the order must still require approval.
  const lines: RiskLineInput[] = [
    { id: 'A', productName: 'Item A', category: ProductCategory.HARDWARE, qty: 1, unitPrice: money(1000), discountPct: 17 },
    { id: 'B', productName: 'Item B', category: ProductCategory.HARDWARE, qty: 1, unitPrice: money(1000), discountPct: 18 },
    { id: 'C', productName: 'Item C', category: ProductCategory.HARDWARE, qty: 1, unitPrice: money(1000), discountPct: 17 },
  ];
  const result = calculateBlendedRisk(lines, CustomerTier.GOLD, config);

  it('flags no single line as severe', () => {
    expect(result.maxSingleOver).toBeLessThan(config.thresholds?.hardEscalationMaxSingleOver ?? 8);
    expect(result.maxSingleOver).toBe(3);
  });

  it('still produces a non-zero score', () => {
    // blended = (2+3+2)/3 = 2.333 -> 2.333*7 + 3*3 = 25.33 -> 25
    expect(result.blendedOverPct).toBeCloseTo(2.33, 2);
    expect(result.riskScore).toBe(25);
  });

  it('routes to at least a Sales Manager', () => {
    expect(result.riskLevel).toBe(RiskLevel.MEDIUM);
    expect(result.requiredChain).toEqual([Role.SALES_MANAGER]);
  });

  it('explains that the accumulation, not one line, is the trigger', () => {
    expect(result.summary).toContain('accumulated across the order');
  });
});

describe('calculateBlendedRisk — clean quote', () => {
  const lines: RiskLineInput[] = [
    { id: 'A', productName: 'Laptop Pro 14', category: ProductCategory.HARDWARE, qty: 3, unitPrice: money(1200), discountPct: 10 },
    { id: 'B', productName: 'Onsite Setup Service', category: ProductCategory.SERVICES, qty: 1, unitPrice: money(450), discountPct: 10 },
  ];
  const result = calculateBlendedRisk(lines, CustomerTier.GOLD, config);

  it('scores 0 and requires nobody', () => {
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe(RiskLevel.NONE);
    expect(result.requiredChain).toEqual([]);
    expect(isAutoApproved(result)).toBe(true);
  });

  it('still returns a full explanation table (every line, marked OK)', () => {
    expect(result.explanation).toHaveLength(2);
    expect(result.explanation.every((r) => r.status === LineDiscountStatus.OK)).toBe(true);
    expect(result.summary).toBe('Every line is within its own discount limit. No approval required.');
  });
});

describe('hard escalation override', () => {
  it('forces HIGH when one line is 8+ points over, even if a huge clean line dilutes the average', () => {
    const lines: RiskLineInput[] = [
      // 100 laptops perfectly within limit swamp the weighted average...
      { id: 'A', productName: 'Laptop Pro 14', category: ProductCategory.HARDWARE, qty: 100, unitPrice: money(1200), discountPct: 0 },
      // ...but this one small service line is 10 points over its own limit.
      { id: 'B', productName: 'Onsite Setup Service', category: ProductCategory.SERVICES, qty: 1, unitPrice: money(450), discountPct: 20 },
    ];
    const result = calculateBlendedRisk(lines, CustomerTier.GOLD, config);
    expect(result.blendedOverPct).toBeLessThan(1);
    expect(result.riskScore).toBeLessThan(31);
    expect(result.riskLevel).toBe(RiskLevel.HIGH); // escalated by maxSingleOver, not by score
    expect(result.requiredChain).toEqual([Role.SALES_MANAGER, Role.FINANCE]);
    expect(result.summary).toContain('hard escalation');
  });
});

describe('configuration drives everything (screen 18 changes behaviour live)', () => {
  const q1042Lines: RiskLineInput[] = [
    { id: 'L1', productName: 'Laptop Pro 14', category: ProductCategory.HARDWARE, qty: 2, unitPrice: money(1200), discountPct: 12 },
    { id: 'L2', productName: 'Onsite Setup Service', category: ProductCategory.SERVICES, qty: 1, unitPrice: money(450), discountPct: 18 },
  ];

  it('raising ONLY the Services ceiling 10 -> 20 still leaves the Gold tier ceiling binding', () => {
    // allowed = min(tierCeiling 15, categoryCeiling 20) = 15. 18% given is still 3 points over.
    // The quote drops from HIGH (two approvers) to MEDIUM (one approver) but does not clear.
    // This is the whole point of "the stricter of the two always wins".
    const relaxed: RiskConfig = {
      tierCeilings: config.tierCeilings,
      categoryCeilings: { ...config.categoryCeilings, SERVICES: 20 },
    };
    const result = calculateBlendedRisk(q1042Lines, CustomerTier.GOLD, relaxed);
    expect(result.explanation[1].allowed).toBe(15);
    expect(result.explanation[1].overBy).toBe(3);
    expect(result.riskScore).toBe(12); // (450*3/2850)*7 + 3*3
    expect(result.riskLevel).toBe(RiskLevel.MEDIUM);
    expect(result.requiredChain).toEqual([Role.SALES_MANAGER]);
  });

  it('raising BOTH the Services ceiling and the Gold tier ceiling to 20 auto-approves Q-1042', () => {
    const relaxed: RiskConfig = {
      tierCeilings: { ...config.tierCeilings, GOLD: 20 },
      categoryCeilings: { ...config.categoryCeilings, SERVICES: 20 },
    };
    const result = calculateBlendedRisk(q1042Lines, CustomerTier.GOLD, relaxed);
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe(RiskLevel.NONE);
    expect(result.requiredChain).toEqual([]);
    expect(isAutoApproved(result)).toBe(true);
  });

  it('a quote only marginally over clears with a single category-ceiling change', () => {
    // Service line at 12%: over the 10% Services ceiling, but inside Gold's 15%.
    const marginal: RiskLineInput[] = [
      { id: 'L1', productName: 'Laptop Pro 14', category: ProductCategory.HARDWARE, qty: 2, unitPrice: money(1200), discountPct: 12 },
      { id: 'L2', productName: 'Onsite Setup Service', category: ProductCategory.SERVICES, qty: 1, unitPrice: money(450), discountPct: 12 },
    ];
    expect(calculateBlendedRisk(marginal, CustomerTier.GOLD, config).riskLevel).toBe(RiskLevel.MEDIUM);
    const relaxed: RiskConfig = {
      tierCeilings: config.tierCeilings,
      categoryCeilings: { ...config.categoryCeilings, SERVICES: 15 },
    };
    const after = calculateBlendedRisk(marginal, CustomerTier.GOLD, relaxed);
    expect(after.riskScore).toBe(0);
    expect(isAutoApproved(after)).toBe(true);
  });

  it('a Bronze customer is capped at 5% even on Hardware', () => {
    const lines: RiskLineInput[] = [
      { id: 'L1', productName: 'Laptop Pro 14', category: ProductCategory.HARDWARE, qty: 1, unitPrice: money(1200), discountPct: 12 },
    ];
    const result = calculateBlendedRisk(lines, CustomerTier.BRONZE, config);
    expect(result.explanation[0].allowed).toBe(5);
    expect(result.explanation[0].overBy).toBe(7);
    expect(result.riskScore).toBe(70); // 7*7 + 7*3
    expect(result.riskLevel).toBe(RiskLevel.HIGH);
  });

  it('custom thresholds move the band boundaries', () => {
    expect(resolveRiskLevel(29, 0)).toBe(RiskLevel.MEDIUM);
    expect(resolveRiskLevel(30, 0)).toBe(RiskLevel.HIGH);
    expect(
      resolveRiskLevel(29, 0, {
        mediumMinScore: 1,
        highMinScore: 20,
        hardEscalationMaxSingleOver: 8,
        blendedWeight: 7,
        maxSingleWeight: 3,
      }),
    ).toBe(RiskLevel.HIGH);
  });
});

describe('edge cases', () => {
  it('an empty quotation is risk-free and requires nobody', () => {
    const r = calculateBlendedRisk([], CustomerTier.GOLD, config);
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe(RiskLevel.NONE);
    expect(r.explanation).toEqual([]);
  });

  it('zero-value lines do not divide by zero', () => {
    const r = calculateBlendedRisk(
      [{ id: 'Z', productName: 'Freebie', category: ProductCategory.HARDWARE, qty: 0, unitPrice: 0, discountPct: 50 }],
      CustomerTier.GOLD,
      config,
    );
    expect(Number.isFinite(r.riskScore)).toBe(true);
    expect(r.blendedOverPct).toBe(0);
    // The line is still 35 points over its own limit, so the hard escalation fires.
    expect(r.maxSingleOver).toBe(35);
    expect(r.riskLevel).toBe(RiskLevel.HIGH);
  });

  it('the score is capped at 100', () => {
    const r = calculateBlendedRisk(
      [{ id: 'X', productName: 'Giveaway', category: ProductCategory.SUBSCRIPTION, qty: 1, unitPrice: money(100), discountPct: 100 }],
      CustomerTier.BRONZE,
      config,
    );
    expect(r.riskScore).toBe(100);
  });

  it('resolveApprovalChain honours a custom chain map', () => {
    expect(resolveApprovalChain(RiskLevel.HIGH)).toEqual(DEFAULT_CHAINS.HIGH);
    expect(resolveApprovalChain(RiskLevel.MEDIUM, { MEDIUM: [Role.FINANCE] })).toEqual([Role.FINANCE]);
  });
});
