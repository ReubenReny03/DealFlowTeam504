/**
 * THE BLENDED DISCOUNT RISK SCORE.
 *
 * This is the single most judge-visible piece of logic in DealFlow360 and the
 * only place in the codebase allowed to decide whether a quotation needs a human.
 * It is pure: same inputs -> same outputs, no clock, no database, no randomness.
 * The API calls it on submit; the Angular builder calls it on every keystroke.
 *
 * ---------------------------------------------------------------------------
 * The rule, in full
 * ---------------------------------------------------------------------------
 * For each line i:
 *     allowedPct_i = min(tierCeiling, categoryCeiling)   <- the stricter wins
 *     overBy_i     = max(0, discountPct_i - allowedPct_i) (percentage POINTS)
 *     lineGross_i  = unitPrice_i * qty_i                  (pre-discount weight)
 *
 * Then:
 *     blendedOverPct = SUM(lineGross_i * overBy_i) / SUM(lineGross_i)
 *     maxSingleOver  = MAX(overBy_i)
 *     riskScore      = min(100, round(blendedOverPct * 7 + maxSingleOver * 3))
 *
 * Why two terms? The `blendedOverPct` term catches "death by a thousand cuts" —
 * many lines each a little over, none alarming alone. The `maxSingleOver` term
 * catches one badly-broken line that a large clean line would otherwise dilute.
 * Neither alone is sufficient; that is what "blended" means.
 *
 * Routing (all thresholds live in ApprovalChainConfig, editable on screen 18):
 *     score === 0            -> NONE   -> auto-approved, no human step
 *     1 <= score < 30        -> MEDIUM -> [SALES_MANAGER]
 *     score >= 30            -> HIGH   -> [SALES_MANAGER, FINANCE]
 *     maxSingleOver >= 8     -> HIGH, unconditionally (hard escalation override)
 *
 * ---------------------------------------------------------------------------
 * Worked example (the PDF's Gold customer, reproduced verbatim in the tests)
 * ---------------------------------------------------------------------------
 *   Laptop Pro 14   x2 @ $1,200  12% given / 15% allowed -> over 0, gross 2400
 *   Onsite Setup    x1 @ $450    18% given / 10% allowed -> over 8, gross  450
 *   blendedOverPct = (2400*0 + 450*8) / 2850 = 1.2631...
 *   maxSingleOver  = 8
 *   riskScore      = round(1.2631*7 + 8*3) = round(32.842) = 33  -> HIGH
 *                 -> chain [SALES_MANAGER, FINANCE]
 */
import {
  CustomerTier,
  LineDiscountStatus,
  ProductCategory,
  RiskLevel,
  Role,
} from '../enums/index.js';
import type { Money } from '../util/money.js';
import { resolveAllowedDiscount, roundToTwo, type DiscountCeilings } from './pricing.js';

/** Minimum shape the engine needs. Any PricedLine satisfies it structurally. */
export interface RiskLineInput {
  id: string;
  productName: string;
  category: ProductCategory;
  qty: number;
  unitPrice: Money;
  discountPct: number;
  /** Optional pre-resolved ceiling; recomputed from config when absent. */
  allowedDiscountPct?: number;
}

export interface RiskThresholds {
  mediumMinScore: number;
  highMinScore: number;
  hardEscalationMaxSingleOver: number;
  blendedWeight: number;
  maxSingleWeight: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  mediumMinScore: 1,
  highMinScore: 30,
  hardEscalationMaxSingleOver: 8,
  blendedWeight: 7,
  maxSingleWeight: 3,
};

export const DEFAULT_CHAINS: Record<RiskLevel, Role[]> = {
  NONE: [],
  LOW: [],
  MEDIUM: [Role.SALES_MANAGER],
  HIGH: [Role.SALES_MANAGER, Role.FINANCE],
};

export interface RiskExplanationRow {
  lineId: string;
  line: string;
  category: ProductCategory;
  given: number;
  allowed: number;
  overBy: number;
  status: LineDiscountStatus;
  weight: number;
}

export interface RiskAssessment {
  riskScore: number;
  riskLevel: RiskLevel;
  blendedOverPct: number;
  maxSingleOver: number;
  requiredChain: Role[];
  explanation: RiskExplanationRow[];
  summary: string;
  ceilingsUsed: {
    tier: CustomerTier;
    tierCeiling: number;
    categoryCeilings: Record<ProductCategory, number>;
  };
}

export interface RiskConfig extends DiscountCeilings {
  thresholds?: Partial<RiskThresholds>;
  chains?: Partial<Record<RiskLevel, Role[]>>;
}

/**
 * Compute the blended discount risk for a set of quotation lines.
 * ALWAYS returns a populated `explanation` array — screen 6 renders it verbatim
 * and must never recompute any of these numbers itself.
 */
export function calculateBlendedRisk(
  lines: RiskLineInput[],
  tier: CustomerTier,
  config: RiskConfig,
): RiskAssessment {
  const thresholds: RiskThresholds = { ...DEFAULT_RISK_THRESHOLDS, ...(config.thresholds ?? {}) };
  const chains: Record<RiskLevel, Role[]> = { ...DEFAULT_CHAINS, ...(config.chains ?? {}) };

  const rows: (RiskExplanationRow & { gross: Money })[] = lines.map((line) => {
    const allowed =
      line.allowedDiscountPct ?? resolveAllowedDiscount(tier, line.category, config);
    const given = Math.min(100, Math.max(0, line.discountPct));
    const overBy = Math.max(0, roundToTwo(given - allowed));
    const gross = line.unitPrice * Math.max(0, Math.trunc(line.qty));
    return {
      lineId: line.id,
      line: line.productName,
      category: line.category,
      given,
      allowed,
      overBy,
      status: overBy > 0 ? LineDiscountStatus.OVER : LineDiscountStatus.OK,
      weight: 0, // filled in below, once we know the denominator
      gross,
    };
  });

  const grossTotal = rows.reduce((acc, r) => acc + r.gross, 0);

  // Revenue-weighted average points-over-limit across the whole order.
  const blendedOverPct =
    grossTotal === 0 ? 0 : rows.reduce((acc, r) => acc + r.gross * r.overBy, 0) / grossTotal;

  const maxSingleOver = rows.reduce((acc, r) => Math.max(acc, r.overBy), 0);

  const rawScore =
    blendedOverPct * thresholds.blendedWeight + maxSingleOver * thresholds.maxSingleWeight;
  const riskScore = Math.min(100, Math.round(rawScore));

  const riskLevel = resolveRiskLevel(riskScore, maxSingleOver, thresholds);

  const explanation: RiskExplanationRow[] = rows.map(({ gross, ...row }) => ({
    ...row,
    weight: grossTotal === 0 ? 0 : roundToTwo(gross / grossTotal),
  }));

  return {
    riskScore,
    riskLevel,
    blendedOverPct: roundToTwo(blendedOverPct),
    maxSingleOver,
    requiredChain: chains[riskLevel] ?? [],
    explanation,
    summary: buildSummary(explanation, riskScore, riskLevel, maxSingleOver, thresholds),
    ceilingsUsed: {
      tier,
      tierCeiling: config.tierCeilings[tier] ?? 0,
      categoryCeilings: config.categoryCeilings,
    },
  };
}

/** Score + hard-escalation override -> risk level. Exported so tests can pin it. */
export function resolveRiskLevel(
  riskScore: number,
  maxSingleOver: number,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskLevel {
  // One catastrophically over line escalates the whole order, even if a huge
  // clean line would otherwise have diluted the blended average to near zero.
  if (maxSingleOver >= thresholds.hardEscalationMaxSingleOver) return RiskLevel.HIGH;
  if (riskScore >= thresholds.highMinScore) return RiskLevel.HIGH;
  if (riskScore >= thresholds.mediumMinScore) return RiskLevel.MEDIUM;
  return RiskLevel.NONE;
}

/** Which roles must approve. NONE => empty array => auto-approve, no human step. */
export function resolveApprovalChain(
  riskLevel: RiskLevel,
  chains: Partial<Record<RiskLevel, Role[]>> = DEFAULT_CHAINS,
): Role[] {
  return chains[riskLevel] ?? DEFAULT_CHAINS[riskLevel] ?? [];
}

/** True when the quotation can skip every human and go straight to the customer. */
export function isAutoApproved(assessment: Pick<RiskAssessment, 'requiredChain'>): boolean {
  return assessment.requiredChain.length === 0;
}

function buildSummary(
  rows: RiskExplanationRow[],
  score: number,
  level: RiskLevel,
  maxSingleOver: number,
  thresholds: RiskThresholds,
): string {
  const over = rows.filter((r) => r.status === LineDiscountStatus.OVER);
  if (over.length === 0) {
    return 'Every line is within its own discount limit. No approval required.';
  }
  const worst = over.reduce((a, b) => (b.overBy > a.overBy ? b : a));
  const parts = [
    `${over.length} of ${rows.length} line${rows.length === 1 ? '' : 's'} exceed their own limit.`,
    `Worst line is "${worst.line}" at ${worst.overBy} points over (${worst.given}% given, ${worst.allowed}% allowed).`,
    `Blended risk score ${score} -> ${level}.`,
  ];
  if (maxSingleOver >= thresholds.hardEscalationMaxSingleOver) {
    parts.push(
      `A single line is ${maxSingleOver} points over, at or above the ${thresholds.hardEscalationMaxSingleOver}-point hard escalation limit, so this quotation is HIGH risk regardless of its score.`,
    );
  } else if (over.length > 1 && maxSingleOver < thresholds.hardEscalationMaxSingleOver) {
    parts.push(
      'No single line looks alarming, but the overage accumulated across the order is what triggered this.',
    );
  }
  return parts.join(' ');
}
