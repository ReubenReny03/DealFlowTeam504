/**
 * Screens 5 and 6.
 * The read side wires the queue, the counts and the "Why This Quote Was
 * Flagged" payload. This file also owns the state machine — approve / return
 * / reject, step advance, and the SLA cycle-time stamp.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  AuditEntity,
  QuoteStage,
  Role,
  type ApprovalListDto,
} from '@dealflow/shared';
import { Approval, AuditLog, Quotation, User } from '../../db/models.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { forbidden, invalidState, notFound } from '../../utils/apiError.js';
import { listParams, pageMeta, searchFilter, stableSort } from '../../utils/listQuery.js';
import { ok } from '../../utils/respond.js';
import { toDto, toDtoList } from '../../utils/serialize.js';
import { writeAudit } from '../../utils/audit.js';
import { mountModuleHealth } from '../module.health.js';

export const approvalsRouter = Router();

const APPROVER_VIEW: Role[] = [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE, Role.SALES_REP];
const DECISION_ROLES: Role[] = [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE];

mountModuleHealth(approvalsRouter, {
  module: 'approvals',
  owner: 'C',
  screens: [5, 6],
  implemented: [
    'GET /',
    'GET /:id',
    'GET /:id/trail',
    'POST /:id/approve',
    'POST /:id/return',
    'POST /:id/reject',
  ],
  todo: [],
});

approvalsRouter.get(
  '/',
  requireAuth(APPROVER_VIEW),
  asyncHandler(async (req, res) => {
    const params = listParams(req.query);
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.pendingOnly === 'true') filter.status = ApprovalStatus.PENDING;
    // Finance only ever needs to see what is actually sitting with Finance.
    if (req.query.assignedToMe === 'true') {
      filter.status = ApprovalStatus.PENDING;
      filter.currentStage = req.user!.role;
    }
    // The queue is searched by the things an approver actually knows: the
    // quotation number they were sent, the customer, or the rep who submitted it.
    Object.assign(
      filter,
      searchFilter(params.q, ['quotationNumber', 'customerName', 'ownerName']) ?? {},
    );

    const [items, total, pending, returned, approved, rejected] = await Promise.all([
      Approval.find(filter)
        .sort(stableSort({ submittedAt: -1 }))
        .skip(params.skip)
        .limit(params.pageSize)
        .lean(),
      Approval.countDocuments(filter),
      Approval.countDocuments({ status: ApprovalStatus.PENDING }),
      Approval.countDocuments({ status: ApprovalStatus.RETURNED }),
      Approval.countDocuments({ status: ApprovalStatus.APPROVED }),
      Approval.countDocuments({ status: ApprovalStatus.REJECTED }),
    ]);

    const payload: ApprovalListDto = {
      counts: { pending, returned, approved, rejected },
      items: toDtoList(items),
    };
    ok(res, payload, pageMeta(params, total));
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

/**
 * Screen 6's audit trail table.
 * `AuditLog.entityId` for entity=APPROVAL is always the QUOTATION's id (see
 * the submit handler in quotations.routes.ts) so that a quotation's full
 * story — creation, edits, submit, approve/return/reject — reads as one
 * continuous trail whether you query it from here or from
 * `GET /quotations/:id/audit`. It is not the approval document's own id.
 */
approvalsRouter.get(
  '/:id/trail',
  requireAuth(APPROVER_VIEW),
  asyncHandler(async (req, res) => {
    const doc: any = await Approval.findById(req.params.id).lean();
    if (!doc) throw notFound(`No approval with id ${req.params.id}`);
    const logs = await AuditLog.find({ entityId: doc.quotationId }).sort({ timestamp: 1 }).lean();
    ok(res, { trail: doc.trail, auditLog: toDtoList(logs) });
  }),
);

/* ------------------------------------------------------------------ the state machine */

const decisionSchema = z.object({ reason: z.string().trim().min(1, 'A reason is required.') });

/** Who the next step lands on. Screen 5/6's "Assigned To" column. */
async function resolveAssignee(role: Role): Promise<string | undefined> {
  const user = await User.findOne({ role, active: true }).lean();
  return (user as any)?.name;
}

/** Only the role holding the active step may decide it — an Admin may act on any step. */
function assertActiveStepRole(approval: any, actorRole: Role): any {
  if (approval.status !== ApprovalStatus.PENDING || approval.currentStepIndex < 0) {
    throw invalidState(
      `This approval is ${approval.status}, not PENDING. There is nothing left to decide.`,
    );
  }
  const step = approval.steps[approval.currentStepIndex];
  if (!step || step.status !== ApprovalStepStatus.ACTIVE) {
    throw invalidState('The active step could not be resolved for this approval.');
  }
  if (actorRole !== step.role && actorRole !== Role.ADMIN) {
    throw forbidden(`This step needs ${step.role}. You are signed in as ${actorRole}.`);
  }
  return step;
}

approvalsRouter.post(
  '/:id/approve',
  requireAuth(DECISION_ROLES),
  validate(decisionSchema),
  asyncHandler(async (req, res) => {
    const approval: any = await Approval.findById(req.params.id);
    if (!approval) throw notFound(`No approval with id ${req.params.id}`);
    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };
    const step = assertActiveStepRole(approval, actor.role);
    const { reason } = req.body as { reason: string };
    const now = new Date();

    step.status = ApprovalStepStatus.APPROVED;
    step.actorId = actor.id;
    step.actorName = actor.name;
    step.action = ApprovalAction.APPROVED;
    step.reason = reason;
    step.actedAt = now;

    const nextIndex = approval.currentStepIndex + 1;
    const nextStep = approval.steps[nextIndex];
    let fullyApproved = false;
    if (nextStep) {
      nextStep.status = ApprovalStepStatus.ACTIVE;
      nextStep.activatedAt = now;
      approval.currentStepIndex = nextIndex;
      approval.currentStage = nextStep.role;
      approval.assignedToName = await resolveAssignee(nextStep.role);
    } else {
      fullyApproved = true;
      approval.status = ApprovalStatus.APPROVED;
      approval.currentStepIndex = -1;
      approval.currentStage = undefined;
      approval.assignedToName = undefined;
      approval.decidedAt = now;
      approval.cycleTimeMs = now.getTime() - new Date(approval.submittedAt).getTime();
    }
    approval.trail.push({
      actorId: actor.id,
      actorName: actor.name,
      role: actor.role,
      action: ApprovalAction.APPROVED,
      reason,
      at: now,
    });
    await approval.save();

    if (fullyApproved) {
      await Quotation.updateOne(
        { _id: approval.quotationId },
        { $set: { stage: QuoteStage.APPROVED, lastActivityAt: now }, $inc: { version: 1 } },
      );
    }

    await writeAudit({
      actor,
      action: fullyApproved ? 'APPROVED' : 'APPROVED_STEP',
      entity: AuditEntity.APPROVAL,
      entityId: String(approval.quotationId),
      entityLabel: approval.quotationNumber,
      after: fullyApproved ? { status: 'APPROVED' } : { nextStage: approval.currentStage },
      reason,
    });

    ok(res, toDto(approval));
  }),
);

approvalsRouter.post(
  '/:id/return',
  requireAuth(DECISION_ROLES),
  validate(decisionSchema),
  asyncHandler(async (req, res) => {
    const approval: any = await Approval.findById(req.params.id);
    if (!approval) throw notFound(`No approval with id ${req.params.id}`);
    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };
    const step = assertActiveStepRole(approval, actor.role);
    const { reason } = req.body as { reason: string };
    const now = new Date();

    step.status = ApprovalStepStatus.RETURNED;
    step.actorId = actor.id;
    step.actorName = actor.name;
    step.action = ApprovalAction.RETURNED;
    step.reason = reason;
    step.actedAt = now;

    approval.status = ApprovalStatus.RETURNED;
    approval.currentStepIndex = -1;
    approval.currentStage = undefined;
    approval.assignedToName = undefined;
    approval.decidedAt = now;
    approval.cycleTimeMs = now.getTime() - new Date(approval.submittedAt).getTime();
    approval.trail.push({
      actorId: actor.id,
      actorName: actor.name,
      role: actor.role,
      action: ApprovalAction.RETURNED,
      reason,
      at: now,
    });
    await approval.save();

    await Quotation.updateOne(
      { _id: approval.quotationId },
      { $set: { stage: QuoteStage.DRAFT, lastActivityAt: now }, $inc: { version: 1 } },
    );

    await writeAudit({
      actor,
      action: 'RETURNED_FOR_REVISION',
      entity: AuditEntity.APPROVAL,
      entityId: String(approval.quotationId),
      entityLabel: approval.quotationNumber,
      reason,
    });

    ok(res, toDto(approval));
  }),
);

approvalsRouter.post(
  '/:id/reject',
  requireAuth(DECISION_ROLES),
  validate(decisionSchema),
  asyncHandler(async (req, res) => {
    const approval: any = await Approval.findById(req.params.id);
    if (!approval) throw notFound(`No approval with id ${req.params.id}`);
    const actor = { id: req.user!.id, name: req.user!.name, role: req.user!.role };
    const step = assertActiveStepRole(approval, actor.role);
    const { reason } = req.body as { reason: string };
    const now = new Date();

    step.status = ApprovalStepStatus.REJECTED;
    step.actorId = actor.id;
    step.actorName = actor.name;
    step.action = ApprovalAction.REJECTED;
    step.reason = reason;
    step.actedAt = now;
    for (const s of approval.steps) {
      if (s.status === ApprovalStepStatus.PENDING) s.status = ApprovalStepStatus.SKIPPED;
    }

    approval.status = ApprovalStatus.REJECTED;
    approval.currentStepIndex = -1;
    approval.currentStage = undefined;
    approval.assignedToName = undefined;
    approval.decidedAt = now;
    approval.cycleTimeMs = now.getTime() - new Date(approval.submittedAt).getTime();
    approval.trail.push({
      actorId: actor.id,
      actorName: actor.name,
      role: actor.role,
      action: ApprovalAction.REJECTED,
      reason,
      at: now,
    });
    await approval.save();

    await Quotation.updateOne(
      { _id: approval.quotationId },
      { $set: { stage: QuoteStage.REJECTED, lastActivityAt: now }, $inc: { version: 1 } },
    );

    await writeAudit({
      actor,
      action: 'REJECTED',
      entity: AuditEntity.APPROVAL,
      entityId: String(approval.quotationId),
      entityLabel: approval.quotationNumber,
      reason,
    });

    ok(res, toDto(approval));
  }),
);
