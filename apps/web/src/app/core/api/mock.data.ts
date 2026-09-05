/**
 * MOCK MODE fixtures (`environment.useMocks = true`).
 *
 * Keys are regular expressions matched against the request path. The shapes here
 * are drawn from the same seed data the API returns, so a screen developed
 * against mocks looks identical once the real endpoint lands.
 *
 * Add fixtures here as new modules need them; keep each key scoped to one
 * module's request pattern so entries stay easy to find and remove.
 */
export const MOCK_RESPONSES: Record<string, unknown> = {
  '^/auth/demo-accounts$': [
    {
      label: 'Sales Rep',
      name: 'J. Rao',
      email: 'rep@dealflow360.test',
      password: 'Demo@123',
      role: 'SALES_REP',
      landingRoute: '/app/dashboard',
      description: 'Builds Q-1042.',
    },
    {
      label: 'Sales Manager',
      name: 'M. Shah',
      email: 'manager@dealflow360.test',
      password: 'Demo@123',
      role: 'SALES_MANAGER',
      landingRoute: '/app/dashboard',
      description: 'First approver.',
    },
  ],
  '^/quotations/dashboard$': {
    pendingApprovals: 3,
    openQuotations: 12,
    atRiskDeals: 3,
    recentActivity: [
      {
        id: 'm1',
        title: 'Approved',
        detail: 'Approved by Finance',
        actorName: 'K. Iyer',
        entity: 'APPROVAL',
        entityId: 'x',
        entityLabel: 'Q-1046',
        at: new Date().toISOString(),
      },
    ],
    myQuotations: [],
  },
  '^/quotations/board$': {
    columns: [
      {
        stage: 'DRAFT',
        label: 'Draft',
        total: 320000,
        cards: [
          {
            id: 'm-d1',
            number: 'Q-1043',
            customerName: 'Delta LLC',
            tier: 'BRONZE',
            ownerName: 'J. Rao',
            stage: 'DRAFT',
            grandTotal: 320000,
            currency: 'USD',
            riskLevel: 'HIGH',
            riskScore: 88,
            lastActivityAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lineCount: 2,
          },
        ],
      },
      {
        stage: 'PENDING_APPROVAL',
        label: 'Pending Approval',
        total: 256784,
        cards: [
          {
            id: 'm-p1',
            number: 'Q-1042',
            customerName: 'Acme Corp',
            tier: 'GOLD',
            ownerName: 'J. Rao',
            stage: 'PENDING_APPROVAL',
            grandTotal: 256784,
            currency: 'USD',
            riskLevel: 'HIGH',
            riskScore: 33,
            lastActivityAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lineCount: 2,
          },
        ],
      },
      { stage: 'APPROVED', label: 'Approved', total: 0, cards: [] },
      { stage: 'NEGOTIATION', label: 'Negotiation', total: 0, cards: [] },
      { stage: 'CONFIRMED', label: 'Confirmed', total: 0, cards: [] },
    ],
  },
  '^/config$': {
    id: 'mock',
    tierCeilings: { BRONZE: 5, SILVER: 10, GOLD: 15 },
    categoryCeilings: { HARDWARE: 15, SERVICES: 10, SUBSCRIPTION: 5 },
    thresholds: {
      mediumMinScore: 1,
      highMinScore: 30,
      hardEscalationMaxSingleOver: 8,
      blendedWeight: 7,
      maxSingleWeight: 3,
    },
    chains: { NONE: [], LOW: [], MEDIUM: ['SALES_MANAGER'], HIGH: ['SALES_MANAGER', 'FINANCE'] },
    dealHealth: {
      stalledDays: 7,
      anomalyMultiplier: 2,
      anomalyAbsoluteCapPct: 25,
      trailingWindow: 20,
    },
    upsell: {
      coPurchaseWeight: 0.5,
      promotedWeight: 0.2,
      marginWeight: 0.3,
      minMarginThreshold: 500,
      maxSuggestions: 3,
    },
    billing: {
      defaultProrationRule: 'PRORATED',
      cancellationRule: 'PRORATED',
      scheduleHorizon: 12,
      invoiceDueDays: 15,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  '^/deal-health': { stalledDeals: 5, discountAnomalies: 2, deliverySlippage: 1, alerts: [] },
  '^/approvals': { counts: { pending: 3, returned: 1, approved: 12, rejected: 0 }, items: [] },
  '^/invoices$': { counts: { unpaid: 1, paid: 2, overdue: 0 }, items: [] },
  '^/subscriptions$': { counts: { active: 16, paused: 2, cancelled: 3 }, items: [] },
  '^/fulfillment$': { stock: [], awaiting: [] },
  '^/notifications': {
    unreadCount: 1,
    items: [
      {
        id: 'mn1',
        userId: 'u1',
        type: 'NUDGE',
        title: 'Deal nudged',
        body: 'Q-1030 has been idle 9 days — a nudge was sent to the owning rep.',
        link: '/app/deal-health',
        read: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'mn2',
        userId: 'u1',
        type: 'ESCALATION',
        title: 'Discount anomaly escalated',
        body: 'Q-1043 carries a 32% discount vs an 8% rep average.',
        link: '/app/deal-health',
        read: true,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
  },
};
