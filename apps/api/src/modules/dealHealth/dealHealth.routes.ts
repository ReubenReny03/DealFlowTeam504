/** Screen 14 — Deal Health & Anomaly Dashboard. */
import { Router } from 'express';
import { AlertType, Role, type DealHealthDashboardDto } from '@dealflow/shared';
import { DealAlert } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const dealHealthRouter = Router();

mountModuleHealth(dealHealthRouter, {
  module: 'dealHealth', owner: 'D', screens: [14],
  implemented: ['GET / — the three tiles and the alert table'],
  todo: [
    'POST /evaluate — re-run evaluateDealHealth over live data and upsert alerts (Agent D)',
    'POST /:id/nudge — notify the owning rep, write an activity + audit entry (Agent D)',
    'POST /:id/escalate — assign to the manager, write an activity + audit entry (Agent D)',
  ],
});

dealHealthRouter.get(
  '/',
  requireAuth([Role.ADMIN, Role.SALES_MANAGER, Role.SALES_REP, Role.FINANCE]),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

    const [alerts, stalled, anomalies, slippage] = await Promise.all([
      DealAlert.find(filter).sort({ flaggedAt: -1 }).limit(100).lean(),
      DealAlert.countDocuments({ type: AlertType.STALLED_DEAL, status: { $ne: 'RESOLVED' } }),
      DealAlert.countDocuments({ type: AlertType.DISCOUNT_ANOMALY, status: { $ne: 'RESOLVED' } }),
      DealAlert.countDocuments({ type: AlertType.DELIVERY_SLIPPAGE, status: { $ne: 'RESOLVED' } }),
    ]);

    const payload: DealHealthDashboardDto = {
      stalledDeals: stalled,
      discountAnomalies: anomalies,
      deliverySlippage: slippage,
      alerts: toDtoList(alerts),
    };
    ok(res, payload);
  }),
);
