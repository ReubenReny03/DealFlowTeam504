import { Router } from 'express';
import { z } from 'zod';
import { calculateBlendedRisk, type RiskAssessmentDto } from '@dealflow/shared';
import { loadRiskConfig } from '../config/config.service.js';
import { priceLinesForCustomer } from '../pricing/pricing.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { mountModuleHealth } from '../module.health.js';

export const riskRouter = Router();

mountModuleHealth(riskRouter, {
  module: 'risk', domain: 'quotations', screens: [4, 6],
  implemented: ['GET /_health', 'POST /preview'],
  todo: [],
});

const lineSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  qty: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  selectedVariants: z.record(z.string()).optional(),
  addedFromUpsell: z.boolean().optional(),
});

const previewSchema = z.object({
  customerId: z.string().min(1),
  lines: z.array(lineSchema).default([]),
});

/**
 * The blended risk preview for an unsaved cart — used to CONFIRM the client's
 * optimistic score, never to produce it. `calculateBlendedRisk` is the one
 * function allowed to decide this, called here exactly as the builder called
 * it locally a moment ago.
 */
riskRouter.post(
  '/preview',
  requireAuth(),
  validate(previewSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof previewSchema>;
    const riskConfig = await loadRiskConfig();
    const { tier, priced } = await priceLinesForCustomer(body.customerId, body.lines, riskConfig);

    const risk: RiskAssessmentDto = calculateBlendedRisk(
      priced.map((l) => ({
        id: l.id, productName: l.productName, category: l.category,
        qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct,
        allowedDiscountPct: l.allowedDiscountPct,
      })),
      tier,
      riskConfig,
    );

    ok(res, risk);
  }),
);
