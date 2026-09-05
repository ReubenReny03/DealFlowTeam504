/**
 * Screens 2, 3 and 4.
 * Phase 3 wires the read side against real seeded data. The write side — line
 * management, live preview and `POST /:id/submit` (which computes the blended
 * risk and either auto-approves or opens the approval chain) — is Agent B's.
 */
import { Router } from 'express';
import {
  KANBAN_STAGES,
  QuoteStage,
  STAGE_LABEL,
  TERMINAL_STAGES,
  type ActivityItemDto,
  type KanbanBoardDto,
  type QuotationSummaryDto,
  type SalesDashboardDto,
} from '@dealflow/shared';
import { Approval, AuditLog, DealAlert, Quotation } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/respond.js';
import { toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';
import { mountReadonly } from '../readonly.factory.js';

export const quotationsRouter = Router();

mountModuleHealth(quotationsRouter, {
  module: 'quotations', owner: 'B', screens: [2, 3, 4],
  implemented: ['GET /', 'GET /:id', 'GET /board', 'GET /dashboard'],
  todo: [
    'POST / — create a quotation for a customer (Agent B)',
    'PATCH /:id — line add/remove/qty/discount with optimistic-concurrency version check (Agent B)',
    'POST /preview — server-side echo of the client-side live preview (Agent B)',
    'POST /:id/submit — compute risk, then auto-approve or open the approval chain (Agent B) [BLOCKING for Agent C]',
  ],
});

function summarise(q: any): QuotationSummaryDto {
  return {
    id: String(q._id), number: q.number, customerName: q.customerName, tier: q.tier,
    ownerName: q.ownerName, stage: q.stage,
    grandTotal: q.totals?.grandTotal ?? 0, currency: q.currency,
    riskLevel: q.risk?.riskLevel ?? 'NONE', riskScore: q.risk?.riskScore ?? 0,
    lastActivityAt: q.lastActivityAt?.toISOString?.() ?? new Date(q.lastActivityAt).toISOString(),
    updatedAt: q.updatedAt?.toISOString?.() ?? new Date(q.updatedAt).toISOString(),
    lineCount: q.lines?.length ?? 0,
  };
}

/** Screen 3's Kanban board. */
quotationsRouter.get(
  '/board',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.ownerId) filter.ownerId = req.query.ownerId;
    const quotes: any[] = await Quotation.find(filter).sort({ updatedAt: -1 }).lean();
    const board: KanbanBoardDto = {
      columns: KANBAN_STAGES.map((stage) => {
        const cards = quotes.filter((q) => q.stage === stage).map(summarise);
        return {
          stage,
          label: STAGE_LABEL[stage],
          total: cards.reduce((a, c) => a + c.grandTotal, 0),
          cards: cards.slice(0, 25),
        };
      }),
    };
    ok(res, board, { totalQuotations: quotes.length });
  }),
);

/** Screen 2's KPI tiles and recent-activity feed. */
quotationsRouter.get(
  '/dashboard',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const [pendingApprovals, openQuotations, atRiskDeals, activity, mine] = await Promise.all([
      Approval.countDocuments({ status: 'PENDING' }),
      Quotation.countDocuments({ stage: { $nin: TERMINAL_STAGES } }),
      DealAlert.countDocuments({ status: { $in: ['OPEN', 'NUDGED', 'ESCALATED'] } }),
      AuditLog.find().sort({ timestamp: -1 }).limit(8).lean(),
      Quotation.find({ ownerId: req.user!.id, stage: { $nin: [QuoteStage.REJECTED] } })
        .sort({ lastActivityAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const recentActivity: ActivityItemDto[] = (activity as any[]).map((a) => ({
      id: String(a._id),
      title: a.action.replace(/_/g, ' ').toLowerCase().replace(/^./, (c: string) => c.toUpperCase()),
      detail: a.reason || `${a.entityLabel ?? a.entity} updated`,
      actorName: a.actor,
      entity: a.entity,
      entityId: String(a.entityId),
      entityLabel: a.entityLabel ?? '',
      at: new Date(a.timestamp).toISOString(),
    }));

    const dashboard: SalesDashboardDto = {
      pendingApprovals, openQuotations, atRiskDeals,
      recentActivity,
      myQuotations: (mine as any[]).map(summarise),
    };
    ok(res, dashboard);
  }),
);

/** Screen 4's line-level audit history. */
quotationsRouter.get(
  '/:id/audit',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const entries = await AuditLog.find({ entityId: req.params.id }).sort({ timestamp: 1 }).lean();
    ok(res, toDtoList(entries));
  }),
);

mountReadonly(quotationsRouter, {
  model: Quotation,
  sort: { lastActivityAt: -1 },
  searchFields: ['number', 'customerName'],
  filterFields: ['stage', 'ownerId', 'customerId'],
});
