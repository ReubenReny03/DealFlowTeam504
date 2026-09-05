/**
 * What a role is allowed to SEE on the list screens.
 *
 * This is the read-side counterpart to `requireAuth`. `requireAuth` answers
 * "may you open this screen at all"; these answer "and which rows belong on it".
 * Both live on the server because a filter the browser applies is a suggestion,
 * not a rule.
 *
 * Only FINANCE is narrowed today. Everyone else sees the whole collection, so
 * the helpers return an empty filter and the caller spreads it unconditionally.
 */
import {
  ApprovalStepStatus,
  FINANCE_QUOTATION_STAGES,
  QuoteStage,
  Role,
} from '@dealflow/shared';

/**
 * A step is "activated" once the chain actually reached it. PENDING means it is
 * still waiting behind an earlier approver; SKIPPED means the chain was rejected
 * before it ever got there. Neither ever landed on that role's desk.
 */
const ACTIVATED_STEP_STATUSES: ApprovalStepStatus[] = [
  ApprovalStepStatus.ACTIVE,
  ApprovalStepStatus.APPROVED,
  ApprovalStepStatus.RETURNED,
  ApprovalStepStatus.REJECTED,
];

/**
 * Finance works the second half of a deal, so the quotation list shows what has
 * cleared approval — APPROVED, NEGOTIATION and CONFIRMED — and not the drafts,
 * the quotes still awaiting a Sales Manager, or the rejected ones. Confirmed
 * deals stay visible on purpose: they are what invoices are raised against.
 */
export function quotationScopeFor(role: Role | undefined): Record<string, unknown> {
  if (role !== Role.FINANCE) return {};
  return { stage: { $in: FINANCE_QUOTATION_STAGES } };
}

/** The Kanban columns a role may see, in the usual left-to-right order. */
export function visibleStagesFor(role: Role | undefined, stages: QuoteStage[]): QuoteStage[] {
  if (role !== Role.FINANCE) return stages;
  return stages.filter((stage) => FINANCE_QUOTATION_STAGES.includes(stage));
}

/**
 * The approval queue shows Finance the approvals that genuinely reached them —
 * the Finance step is active now, or they already decided it. A MEDIUM-risk quote
 * routed to the Sales Manager alone never involves Finance, and a HIGH-risk one
 * still sitting with the Manager has not reached them yet: on a HIGH chain the
 * Finance step stays inactive until the Manager approves (docs/USER_FLOWS.md).
 */
export function approvalScopeFor(role: Role | undefined): Record<string, unknown> {
  if (role !== Role.FINANCE) return {};
  return {
    steps: { $elemMatch: { role: Role.FINANCE, status: { $in: ACTIVATED_STEP_STATUSES } } },
  };
}

/**
 * Intersect a caller-supplied `?stage=` with what the role may see, so a
 * hand-typed query string can narrow the scope but never widen it.
 */
export function applyStageFilter(
  filter: Record<string, unknown>,
  requested: unknown,
  role: Role | undefined,
): void {
  const scope = quotationScopeFor(role);
  const allowed = (scope.stage as { $in: QuoteStage[] } | undefined)?.$in;

  if (requested === undefined || requested === '') {
    if (allowed) filter.stage = { $in: allowed };
    return;
  }
  if (!allowed) {
    filter.stage = requested;
    return;
  }
  filter.stage = allowed.includes(requested as QuoteStage)
    ? requested
    : // Asked for a stage this role cannot see: match nothing rather than
      // quietly returning the whole allowed set.
      { $in: [] };
}
