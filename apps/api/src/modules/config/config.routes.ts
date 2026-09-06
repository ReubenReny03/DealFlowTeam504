/**
 * Screen 18 — Discount Tiers & Approval Chain Setup.
 *
 * This is the file that proves nothing in DealFlow360 is hardcoded: change a
 * ceiling here and every open quotation is re-scored on the spot, some of them
 * dropping out of the approval queue entirely.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  ApprovalStatus,
  AuditEntity,
  type CustomerTier,
  type ProductCategory,
  QuoteStage,
  Role,
  calculateBlendedRisk,
  computeLinePricing,
  computeQuoteTotals,
  resolveAllowedDiscount,
  type ConfigChangeImpactDto,
} from '@dealflow/shared';
import { Approval, ApprovalChainConfig, Quotation } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { emitConfigUpdated } from '../../realtime/emit.js';
import { mountModuleHealth } from '../module.health.js';
import { loadConfig, toRiskConfig } from './config.service.js';

export const configRouter = Router();

mountModuleHealth(configRouter, {
  module: 'config', domain: 'governance', screens: [18],
  implemented: ['GET /', 'PUT / (re-evaluates every open quotation)'],
  todo: [],
});

configRouter.get(
  '/',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    ok(res, toDto(await loadConfig()));
  }),
);

const pctMap = z.record(z.number().min(0).max(100)).optional();
const updateSchema = z.object({
  tierCeilings: pctMap,
  categoryCeilings: pctMap,
  thresholds: z
    .object({
      mediumMinScore: z.number().min(0).max(100).optional(),
      highMinScore: z.number().min(0).max(100).optional(),
      hardEscalationMaxSingleOver: z.number().min(0).max(100).optional(),
      blendedWeight: z.number().min(0).optional(),
      maxSingleWeight: z.number().min(0).optional(),
    })
    .optional(),
  chains: z.record(z.array(z.string())).optional(),
  dealHealth: z.record(z.number()).optional(),
  upsell: z.record(z.number()).optional(),
  billing: z.record(z.union([z.string(), z.number()])).optional(),
  reason: z.string().min(1, 'Every configuration change must record a reason.'),
});

configRouter.put(
  '/',
  requireAuth([Role.ADMIN, Role.SALES_MANAGER]),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const doc = await ApprovalChainConfig.findOne({ key: 'default' });
    if (!doc) throw notFound('Governance configuration has not been initialised. Run `npm run reset`.');

    const before = toDto(doc);
    const body = req.body as z.infer<typeof updateSchema>;

    if (body.tierCeilings) for (const [k, v] of Object.entries(body.tierCeilings)) doc.tierCeilings.set(k, v);
    if (body.categoryCeilings) for (const [k, v] of Object.entries(body.categoryCeilings)) doc.categoryCeilings.set(k, v);
    if (body.thresholds) Object.assign(doc.thresholds, body.thresholds);
    if (body.chains) for (const [k, v] of Object.entries(body.chains)) doc.chains.set(k, v);
    if (body.dealHealth) Object.assign(doc.dealHealth, body.dealHealth);
    if (body.upsell) Object.assign(doc.upsell, body.upsell);
    if (body.billing) Object.assign(doc.billing, body.billing);
    doc.updatedBy = req.user!.name;
    await doc.save();

    const riskConfig = toRiskConfig(doc);

    /* ---- Re-evaluate every quotation that is still in play ---- */
    const openQuotes = await Quotation.find({
      stage: { $in: [QuoteStage.DRAFT, QuoteStage.PENDING_APPROVAL, QuoteStage.NEGOTIATION, QuoteStage.APPROVED] },
    });

    const reevaluated: ConfigChangeImpactDto['reevaluated'] = [];

    for (const q of openQuotes) {
      const previousScore = q.risk?.riskScore ?? 0;
      const previousLevel = q.risk?.riskLevel ?? 'NONE';

      // Re-price the lines: the allowed discount per line may have moved.
      const priced = (q.lines as any[]).map((l: any) =>
        computeLinePricing(
          {
            id: l.lineId, productId: String(l.productId), productName: l.productName,
            sku: l.sku, category: l.category, qty: l.qty, unitPrice: l.unitPrice,
            costPrice: l.costPrice, discountPct: l.discountPct, taxPct: l.taxPct,
            isSubscription: l.isSubscription, recurringCycle: l.recurringCycle,
          },
          q.tier,
          riskConfig,
        ),
      );
      const risk = calculateBlendedRisk(
        priced.map((l) => ({
          id: l.id, productName: l.productName, category: l.category,
          qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct,
          allowedDiscountPct: l.allowedDiscountPct,
        })),
        q.tier,
        riskConfig,
      );

      if (risk.riskScore === previousScore && risk.riskLevel === previousLevel) continue;

      q.lines.forEach((l: any, i: number) => {
        l.allowedDiscountPct = priced[i].allowedDiscountPct;
        l.discountStatus = priced[i].discountStatus;
        l.overByPts = priced[i].overByPts;
      });
      q.totals = computeQuoteTotals(priced) as any;
      q.risk = risk as any;

      // A quote that no longer needs a human stops waiting for one.
      let autoApproved = false;
      if (risk.requiredChain.length === 0 && q.stage === QuoteStage.PENDING_APPROVAL) {
        q.stage = QuoteStage.APPROVED;
        autoApproved = true;
        await Approval.updateOne(
          { quotationId: q._id, status: ApprovalStatus.PENDING },
          {
            $set: { status: ApprovalStatus.NOT_REQUIRED, currentStepIndex: -1, currentStage: undefined, assignedToName: undefined, decidedAt: new Date(), risk },
            $push: {
              trail: {
                actorId: req.user!.id, actorName: req.user!.name, role: req.user!.role,
                action: 'AUTO_APPROVED',
                reason: `Discount governance changed (${body.reason}); this quotation now scores ${risk.riskScore} and needs no approval.`,
                at: new Date(),
              },
            },
          },
        );
      } else {
        await Approval.updateOne({ quotationId: q._id, status: ApprovalStatus.PENDING }, { $set: { risk } });
      }

      q.version += 1;
      q.lastActivityAt = new Date();
      await q.save();

      reevaluated.push({
        quotationId: String(q._id), quotationNumber: q.number,
        previousScore, previousLevel, newScore: risk.riskScore, newLevel: risk.riskLevel,
        autoApproved,
      });
    }

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'CONFIG_SAVED',
      entity: AuditEntity.CONFIG,
      entityId: String(doc._id),
      entityLabel: 'Discount tiers & approval chain',
      before: { tierCeilings: before.tierCeilings, categoryCeilings: before.categoryCeilings, thresholds: before.thresholds },
      after: { tierCeilings: toDto(doc).tierCeilings, categoryCeilings: toDto(doc).categoryCeilings, thresholds: toDto(doc).thresholds },
      reason: body.reason,
    });

    // Everyone internal is looking at numbers that just changed underneath them.
    emitConfigUpdated({
      impactedApprovals: reevaluated.length,
      actorId: req.user!.id,
      actorName: req.user!.name,
    });

    const payload: ConfigChangeImpactDto = { config: toDto(doc), reevaluated };
    ok(res, payload, { reevaluatedCount: reevaluated.length });
  }),
);

/** Preview what a line's allowed discount would be — used by the screen 18 helper text. */
configRouter.get(
  '/allowed-discount',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const cfg = toRiskConfig(await loadConfig());
    const tier = String(req.query.tier ?? 'GOLD') as CustomerTier;
    const category = String(req.query.category ?? 'HARDWARE') as ProductCategory;
    ok(res, {
      tier, category,
      tierCeiling: cfg.tierCeilings[tier],
      categoryCeiling: cfg.categoryCeilings[category],
      allowed: resolveAllowedDiscount(tier, category, cfg),
    });
  }),
);
