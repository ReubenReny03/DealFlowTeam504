/**
 * The realtime contract — the one place the API and the Angular app agree on
 * what travels over the socket.
 *
 * Three things live here and nowhere else:
 *   1. `NotificationType` — the closed set of things a user can be told about;
 *   2. `SocketEvent` — the event names, so a typo cannot silently mean "no
 *      listener ever fires";
 *   3. `SocketRoom` — how a room name is spelt. The server joins sockets to
 *      these rooms and emits to them; the client never names a room itself.
 *
 * Rooms are the authorisation boundary, not a convenience: a socket is joined
 * to `user:<own id>` and to nothing else it has no right to see, so "who
 * receives this" is decided once, at connect time, rather than at every emit.
 */
import type { AuditEntity, Role } from './enums/index.js';
import type { Id } from './types/index.js';
import type { IsoDate } from './util/dates.js';

/* ------------------------------------------------------------------ notifications */

/**
 * Every notification a user can receive. The name says what happened, not who
 * it reached — the same event notifies different people depending on the deal.
 */
export const NotificationType = {
  /* approvals */
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  APPROVAL_STEP_ADVANCED: 'APPROVAL_STEP_ADVANCED',
  APPROVAL_APPROVED: 'APPROVAL_APPROVED',
  APPROVAL_RETURNED: 'APPROVAL_RETURNED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  APPROVAL_AUTO_APPROVED: 'APPROVAL_AUTO_APPROVED',
  /* the customer portal */
  PORTAL_LINK_ISSUED: 'PORTAL_LINK_ISSUED',
  CUSTOMER_COMMENT: 'CUSTOMER_COMMENT',
  CUSTOMER_COUNTER_OFFER: 'CUSTOMER_COUNTER_OFFER',
  CUSTOMER_CONFIRMED: 'CUSTOMER_CONFIRMED',
  REP_REPLIED: 'REP_REPLIED',
  RE_ENTERED_APPROVAL: 'RE_ENTERED_APPROVAL',
  /* orders, stock and delivery */
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  FULFILLMENT_PLANNED: 'FULFILLMENT_PLANNED',
  FULFILLMENT_SHIPPED: 'FULFILLMENT_SHIPPED',
  BACKORDER_RAISED: 'BACKORDER_RAISED',
  CONSOLIDATION_AVAILABLE: 'CONSOLIDATION_AVAILABLE',
  /* billing */
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  /* deal health */
  DEAL_HEALTH_NUDGE: 'DEAL_HEALTH_NUDGE',
  DEAL_HEALTH_ESCALATION: 'DEAL_HEALTH_ESCALATION',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/**
 * How loudly the UI should say it. The bell tints its dot by this and the toast
 * picks its colour from it; nothing about business logic depends on it.
 */
export const NotificationSeverity = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type NotificationSeverity =
  (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

/** The default severity for each type, so a producer only names it when it differs. */
export const NOTIFICATION_SEVERITY: Record<NotificationType, NotificationSeverity> = {
  APPROVAL_REQUESTED: 'WARNING',
  APPROVAL_STEP_ADVANCED: 'INFO',
  APPROVAL_APPROVED: 'SUCCESS',
  APPROVAL_RETURNED: 'WARNING',
  APPROVAL_REJECTED: 'CRITICAL',
  APPROVAL_AUTO_APPROVED: 'SUCCESS',
  PORTAL_LINK_ISSUED: 'INFO',
  CUSTOMER_COMMENT: 'INFO',
  CUSTOMER_COUNTER_OFFER: 'WARNING',
  CUSTOMER_CONFIRMED: 'SUCCESS',
  REP_REPLIED: 'INFO',
  RE_ENTERED_APPROVAL: 'WARNING',
  ORDER_CONFIRMED: 'SUCCESS',
  FULFILLMENT_PLANNED: 'INFO',
  FULFILLMENT_SHIPPED: 'SUCCESS',
  BACKORDER_RAISED: 'WARNING',
  CONSOLIDATION_AVAILABLE: 'INFO',
  INVOICE_ISSUED: 'INFO',
  PAYMENT_RECEIVED: 'SUCCESS',
  SUBSCRIPTION_CANCELLED: 'WARNING',
  DEAL_HEALTH_NUDGE: 'WARNING',
  DEAL_HEALTH_ESCALATION: 'CRITICAL',
};

/** The emoji the bell shows beside each notification. Purely cosmetic. */
export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  APPROVAL_REQUESTED: '🛡️',
  APPROVAL_STEP_ADVANCED: '➡️',
  APPROVAL_APPROVED: '✅',
  APPROVAL_RETURNED: '↩️',
  APPROVAL_REJECTED: '⛔',
  APPROVAL_AUTO_APPROVED: '⚡',
  PORTAL_LINK_ISSUED: '🔗',
  CUSTOMER_COMMENT: '💬',
  CUSTOMER_COUNTER_OFFER: '🤝',
  CUSTOMER_CONFIRMED: '🎉',
  REP_REPLIED: '💬',
  RE_ENTERED_APPROVAL: '🔁',
  ORDER_CONFIRMED: '📦',
  FULFILLMENT_PLANNED: '🗺️',
  FULFILLMENT_SHIPPED: '🚚',
  BACKORDER_RAISED: '⏳',
  CONSOLIDATION_AVAILABLE: '📮',
  INVOICE_ISSUED: '🧾',
  PAYMENT_RECEIVED: '💰',
  SUBSCRIPTION_CANCELLED: '🚫',
  DEAL_HEALTH_NUDGE: '👋',
  DEAL_HEALTH_ESCALATION: '🚨',
};

/* ------------------------------------------------------------------ transport */

/**
 * The socket.io path. Deliberately NOT under `/api/v1` — a websocket upgrade is
 * not a REST call, and keeping it separate means a proxy can route it on its own
 * rules without matching every API route by accident.
 */
export const SOCKET_PATH = '/realtime';

/** The handshake field the client puts its JWT in (`auth.token`). */
export const SOCKET_AUTH_TOKEN = 'token';
/** The handshake field a magic-link customer puts their portal token in. */
export const SOCKET_AUTH_PORTAL_TOKEN = 'portalToken';

/**
 * Every event name, server → client unless noted.
 *
 * `notification:*` is personal — it only ever reaches `user:<id>`.
 * The rest are domain events: "this thing changed, re-read it if you are
 * looking at it". They deliberately carry identity and a summary rather than a
 * whole document, so the socket never becomes a second, subtly different copy
 * of the REST contract.
 */
export const SocketEvent = {
  /* connection lifecycle */
  READY: 'realtime:ready',

  /* personal */
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_COUNT: 'notification:count',

  /* domain */
  QUOTATION_UPDATED: 'quotation:updated',
  APPROVAL_UPDATED: 'approval:updated',
  NEGOTIATION_EVENT: 'negotiation:event',
  ORDER_UPDATED: 'order:updated',
  FULFILLMENT_UPDATED: 'fulfillment:updated',
  INVOICE_UPDATED: 'invoice:updated',
  SUBSCRIPTION_UPDATED: 'subscription:updated',
  ALERT_UPDATED: 'alert:updated',
  STOCK_UPDATED: 'stock:updated',
  CONFIG_UPDATED: 'config:updated',

  /* client → server */
  SUBSCRIBE_QUOTATION: 'subscribe:quotation',
  UNSUBSCRIBE_QUOTATION: 'unsubscribe:quotation',
} as const;
export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];

/**
 * Room names. The server owns membership; the client only ever asks to join a
 * quotation room, and is refused unless it may read that quotation.
 */
export const SocketRoom = {
  /** One socket per browser tab, but every tab of one person shares this room. */
  user: (userId: Id): string => `user:${userId}`,
  /** Everyone currently signed in with this role — how an approval queue lights up. */
  role: (role: Role | string): string => `role:${role}`,
  /** Every internal user. Never contains a CUSTOMER socket. */
  internal: 'internal',
  /** Both sides of one deal: the rep watching it and the customer reading it. */
  quotation: (quotationId: Id): string => `quotation:${quotationId}`,
  /** One customer company — their portal tabs, wherever they are in it. */
  customer: (customerId: Id): string => `customer:${customerId}`,
} as const;

/* ------------------------------------------------------------------ payloads */

/** `realtime:ready` — who the server thinks you are, once the handshake passed. */
export interface RealtimeReadyPayload {
  userId: Id;
  role: Role;
  /** Set for a CUSTOMER (password or magic link); absent for internal users. */
  customerId?: Id;
  /** Set only for a magic-link session: the single quotation it unlocks. */
  quotationId?: Id;
  rooms: string[];
  serverTime: IsoDate;
}

/** `notification:count` — the badge, and nothing else. */
export interface NotificationCountPayload {
  unreadCount: number;
}

/**
 * The shape shared by every domain event. `at` is the server's clock, so a
 * client can discard an event older than the state it already holds.
 */
export interface RealtimeEnvelope {
  /** Who caused it. A client uses this to ignore the echo of its own action. */
  actorId?: Id;
  actorName?: string;
  at: IsoDate;
}

export interface QuotationUpdatedPayload extends RealtimeEnvelope {
  quotationId: Id;
  number: string;
  stage: string;
  version: number;
  customerId: Id;
  ownerId: Id;
  /** "SUBMITTED", "APPROVED", "COUNTER_OFFER_APPLIED" — the audit action that moved it. */
  reason: string;
}

export interface ApprovalUpdatedPayload extends RealtimeEnvelope {
  approvalId: Id;
  quotationId: Id;
  quotationNumber: string;
  status: string;
  /** The role the approval is now sitting on, if it is still pending. */
  currentStage?: Role;
  ownerId: Id;
}

export interface NegotiationEventPayload extends RealtimeEnvelope {
  quotationId: Id;
  eventId: Id;
  type: string;
  fromCustomer: boolean;
  comment?: string;
}

export interface OrderUpdatedPayload extends RealtimeEnvelope {
  orderId: Id;
  number: string;
  status: string;
  quotationId?: Id;
  customerId: Id;
}

export interface FulfillmentUpdatedPayload extends RealtimeEnvelope {
  fulfillmentId: Id;
  orderId: Id;
  orderNumber: string;
  status: string;
  customerId: Id;
}

export interface InvoiceUpdatedPayload extends RealtimeEnvelope {
  invoiceId: Id;
  number: string;
  status: string;
  customerId: Id;
  orderId?: Id;
}

export interface SubscriptionUpdatedPayload extends RealtimeEnvelope {
  subscriptionId: Id;
  number: string;
  status: string;
  customerId: Id;
}

export interface AlertUpdatedPayload extends RealtimeEnvelope {
  alertId: Id;
  status: string;
  quotationId?: Id;
  ownerId: Id;
  entityLabel: string;
}

export interface StockUpdatedPayload extends RealtimeEnvelope {
  productId: Id;
  warehouseId?: Id;
  reason: string;
}

export interface ConfigUpdatedPayload extends RealtimeEnvelope {
  /** How many pending approvals the new thresholds re-scored. */
  impactedApprovals?: number;
}

/** Which entity a notification points at, for the client that wants to group them. */
export interface NotificationEntityRef {
  entity: AuditEntity;
  entityId: Id;
  entityLabel?: string;
}
