/**
 * Screens 5 and 6.
 * Phase 3 wires the queue, the counts and the "Why This Quote Was Flagged"
 * payload. The state machine — approve / return / reject, step advance, the
 * re-approval loop — is Agent C's.
 */
import { Router } from 'express';
import { ApprovalStatus, Role, type ApprovalListDto } from '@dealflow/shared';
import { Approval, AuditLog } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/apiError.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { mountModuleHealth } from '../module.health.js';

export const approvalsRouter = Router();

const APPROVER_VIEW: Role[] = [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE, Role.SALES_REP];

mountModuleHealth(approvalsRouter, {
  module: 'approvals', owner: 'C', screens: [5, 6],
  implemented: ['GET /', 'GET /:id', 'GET /:id/trail'],
  todo: [
    'POST /:id/approve — advance the chain, or finish and move the quote to APPROVED (Agent C)',
    'POST /:id/return — return for revision, quote back to DRAFT (Agent C)',
    'POST /:id/reject — terminal rejection (Agent C)',
    'All three must write an AuditLog entry with actor, role, reason and timestamp (Agent C)',
  ],
});

approvalsRouter.get(
  '/',
  requireAuth(APPROVER_VIEW),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.pendingOnly === 'true') filter.status = ApprovalStatus.PENDING;
    // Finance only ever needs to see what is actually sitting with Finance.
    if (req.query.assignedToMe === 'true') {
      filter.status = ApprovalStatus.PENDING;
      filter.currentStage = req.user!.role;
    }

    const [items, pending, returned, approved, rejected] = await Promise.all([
      Approval.find(filter).sort({ submittedAt: -1 }).limit(100).lean(),
      Approval.countDocuments({ status: ApprovalStatus.PENDING }),
      Approval.countDocuments({ status: ApprovalStatus.RETURNED }),
      Approval.countDocuments({ status: ApprovalStatus.APPROVED }),
      Approval.countDocuments({ status: ApprovalStatus.REJECTED }),
    ]);

    const payload: ApprovalListDto = {
      counts: { pending, returned, approved, rejected },
      items: toDtoList(items),
    };
    ok(res, payload);
  }),
);

approvalsRouter.get(
  '/:id',
  requireAuth(APPROVER_VIEW),
  asyncHandler(async (req, res) => {
    const doc = await Approval.findById(req.params.id).lean();
    if (!doc) throw notFound(`No approval with id ${req.params.id}`);
    ok(res, toDto(doc));
  }),
);

/** Screen 6's audit trail table. */
approvalsRouter.get(
  '/:id/trail',
  requireAuth(APPROVER_VIEW),
  asyncHandler(async (req, res) => {
    const doc: any = await Approval.findById(req.params.id).lean();
    if (!doc) throw notFound(`No approval with id ${req.params.id}`);
    const logs = await AuditLog.find({ entityId: doc._id }).sort({ timestamp: 1 }).lean();
    ok(res, { trail: doc.trail, auditLog: toDtoList(logs) });
  }),
);
