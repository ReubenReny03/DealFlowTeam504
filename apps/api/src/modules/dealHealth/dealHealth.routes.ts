/** Screen 14 — Deal Health & Anomaly Dashboard. */
import { Router } from 'express';
import {
  AlertStatus,
  AlertType,
  AuditEntity,
  Role,
  averageDiscountPct,
  evaluateDealHealth,
  type AlertActionRequest,
  type AlertActionResponse,
  type DealHealthDashboardDto,
  type DealHealthQuote,
} from '@dealflow/shared';
import { DealAlert, Notification, Order, Quotation, User } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { invalidState, notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { loadConfig } from '../config/config.service.js';
import { mountModuleHealth } from '../module.health.js';

export const dealHealthRouter = Router();

mountModuleHealth(dealHealthRouter, {
  module: 'dealHealth', owner: 'D', screens: [14],
  implemented: ['GET / — the three tiles and the alert table', 'POST /evaluate', 'POST /:id/nudge', 'POST /:id/escalate'],
  todo: [],
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

/* ------------------------------------------------------------------ writes */

const WRITE: Role[] = [Role.ADMIN, Role.SALES_MANAGER];

/** Re-runs the real detectors over live data and upserts one alert per (quotation, type) — never a duplicate. */
dealHealthRouter.post(
  '/evaluate',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const [quotes, orders, users, config] = await Promise.all([
      Quotation.find().lean(),
      Order.find().select('quotationId projectedDeliveryDate').lean(),
      User.find().select('trailingAvgDiscountPct').lean(),
      loadConfig(),
    ]);
    const projectedByQuotation = new Map<string, string | undefined>(
      (orders as any[]).map((o) => [String(o.quotationId), o.projectedDeliveryDate?.toISOString()]),
    );
    const repTrailingAverages: Record<string, number> = Object.fromEntries(
      (users as any[]).map((u) => [String(u._id), u.trailingAvgDiscountPct ?? 0]),
    );

    const inputs: DealHealthQuote[] = (quotes as any[]).map((q) => ({
      quotationId: String(q._id),
      quotationNumber: q.number,
      customerId: String(q.customerId),
      customerName: q.customerName,
      ownerId: String(q.ownerId),
      ownerName: q.ownerName,
      stage: q.stage,
      lastActivityAt: q.lastActivityAt.toISOString(),
      avgDiscountPct: averageDiscountPct(q.lines.map((l: any) => ({ lineGross: l.lineGross, discountPct: l.discountPct }))),
      promisedDeliveryDate: q.promisedDeliveryDate?.toISOString(),
      projectedDeliveryDate: projectedByQuotation.get(String(q._id)),
    }));

    const findings = evaluateDealHealth(inputs, repTrailingAverages, new Date(), config.dealHealth);

    let created = 0;
    let updated = 0;
    for (const f of findings) {
      const existed = await DealAlert.exists({ quotationId: f.quotationId, type: f.type });
      await DealAlert.findOneAndUpdate(
        { quotationId: f.quotationId, type: f.type },
        {
          $set: {
            severity: f.severity, quotationNumber: f.quotationNumber,
            customerId: f.customerId, customerName: f.customerName,
            ownerId: f.ownerId, ownerName: f.ownerName,
            entityLabel: f.entityLabel, issue: f.issue, detail: f.detail,
          },
          $setOnInsert: { status: AlertStatus.OPEN, flaggedAt: new Date(), actions: [] },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (existed) updated++;
      else created++;
    }

    await writeAudit({
      actor: { id: req.user!.id, name: req.user!.name, role: req.user!.role },
      action: 'DEAL_HEALTH_EVALUATED',
      entity: AuditEntity.ALERT,
      entityId: req.user!.id,
      after: { evaluated: quotes.length, findings: findings.length, created, updated },
      reason: 'Re-ran the deal-health rules over live data',
    });

    ok(res, { evaluated: quotes.length, findings: findings.length, created, updated });
  }),
);

async function actOnAlert(
  alertId: string,
  action: 'NUDGE' | 'ESCALATE',
  actor: { id: string; name: string; role: Role },
  note?: string,
): Promise<AlertActionResponse> {
  const alert: any = await DealAlert.findById(alertId);
  if (!alert) throw notFound(`No alert with id ${alertId}`);
  if (alert.status === AlertStatus.RESOLVED) throw invalidState('This alert is already resolved.');

  const now = new Date();
  const entry = { action, actorId: actor.id, actorName: actor.name, at: now, note };
  alert.actions.push(entry);
  alert.status = action === 'NUDGE' ? AlertStatus.NUDGED : AlertStatus.ESCALATED;
  await alert.save();

  const recipientId =
    action === 'NUDGE' ? alert.ownerId : (await User.findOne({ role: Role.SALES_MANAGER, active: true }).lean() as any)?._id ?? alert.ownerId;
  await Notification.create({
    userId: recipientId,
    type: action === 'NUDGE' ? 'DEAL_HEALTH_NUDGE' : 'DEAL_HEALTH_ESCALATION',
    title: action === 'NUDGE' ? `Nudge: ${alert.entityLabel}` : `Escalated: ${alert.entityLabel}`,
    body: note || alert.detail,
    link: alert.quotationId ? `/app/quotations/${alert.quotationId}` : undefined,
  });

  await writeAudit({
    actor,
    action: action === 'NUDGE' ? 'DEAL_NUDGED' : 'DEAL_ESCALATED',
    entity: AuditEntity.ALERT,
    entityId: String(alert._id),
    entityLabel: alert.entityLabel,
    reason: note || `${action === 'NUDGE' ? 'Nudged' : 'Escalated'} ${alert.entityLabel}`,
  });

  return { alert: toDto(alert), action: toDto(entry) };
}

dealHealthRouter.post(
  '/:id/nudge',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const body = req.body as AlertActionRequest;
    const payload = await actOnAlert(req.params.id, 'NUDGE', { id: req.user!.id, name: req.user!.name, role: req.user!.role }, body?.note);
    ok(res, payload);
  }),
);

dealHealthRouter.post(
  '/:id/escalate',
  requireAuth(WRITE),
  asyncHandler(async (req, res) => {
    const body = req.body as AlertActionRequest;
    const payload = await actOnAlert(req.params.id, 'ESCALATE', { id: req.user!.id, name: req.user!.name, role: req.user!.role }, body?.note);
    ok(res, payload);
  }),
);
