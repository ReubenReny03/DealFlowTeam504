/**
 * DealFlow360 — canonical enumerations.
 * FROZEN CONTRACT. Changes require an entry in docs/CONTRACT_CHANGELOG.md.
 * Every enum is a `const object + union type` so the values survive JSON round-trips
 * and can be used in Mongoose `enum:` arrays and Angular templates alike.
 */

export const Role = {
  ADMIN: 'ADMIN',
  SALES_REP: 'SALES_REP',
  SALES_MANAGER: 'SALES_MANAGER',
  FINANCE: 'FINANCE',
  CUSTOMER: 'CUSTOMER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ALL_ROLES = Object.values(Role) as Role[];
/** Roles that may act as an approver in an approval chain. */
export const APPROVER_ROLES: Role[] = [Role.SALES_MANAGER, Role.FINANCE];
/** Roles that use the internal shell (everything except the portal). */
export const INTERNAL_ROLES: Role[] = [Role.ADMIN, Role.SALES_REP, Role.SALES_MANAGER, Role.FINANCE];

export const QuoteStage = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  NEGOTIATION: 'NEGOTIATION',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const;
export type QuoteStage = (typeof QuoteStage)[keyof typeof QuoteStage];
/** Kanban column order on screen 3. REJECTED is not a column; it is a filter. */
export const KANBAN_STAGES: QuoteStage[] = [
  QuoteStage.DRAFT,
  QuoteStage.PENDING_APPROVAL,
  QuoteStage.APPROVED,
  QuoteStage.NEGOTIATION,
  QuoteStage.CONFIRMED,
];
/** Stages a deal-health "stalled" check ignores (the deal is finished). */
export const TERMINAL_STAGES: QuoteStage[] = [QuoteStage.CONFIRMED, QuoteStage.REJECTED];

export const ApprovalAction = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
  RESUBMITTED: 'RESUBMITTED',
  AUTO_APPROVED: 'AUTO_APPROVED',
  RE_ENTERED_FROM_NEGOTIATION: 'RE_ENTERED_FROM_NEGOTIATION',
} as const;
export type ApprovalAction = (typeof ApprovalAction)[keyof typeof ApprovalAction];

export const ApprovalStepStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  APPROVED: 'APPROVED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
  SKIPPED: 'SKIPPED',
} as const;
export type ApprovalStepStatus = (typeof ApprovalStepStatus)[keyof typeof ApprovalStepStatus];

export const ApprovalStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const RiskLevel = {
  NONE: 'NONE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/**
 * Screen 5 shows an auto-approved quotation with a "LOW" chip, not "NONE".
 * NONE is the routing state (no human approval required); LOW is its label.
 * See docs/DECISIONS.md D-005.
 */
export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  NONE: 'LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
};

export const ProductCategory = {
  HARDWARE: 'HARDWARE',
  SERVICES: 'SERVICES',
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const;
export type ProductCategory = (typeof ProductCategory)[keyof typeof ProductCategory];

export const CustomerTier = {
  BRONZE: 'BRONZE',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
} as const;
export type CustomerTier = (typeof CustomerTier)[keyof typeof CustomerTier];

export const BillingCycle = {
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
} as const;
export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];
/** Nominal length of one billing cycle in days, used by the proration formula. */
export const CYCLE_DAYS: Record<BillingCycle, number> = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
  YEARLY: 365,
};

export const FulfillmentStatus = {
  PENDING: 'PENDING',
  SPLIT_PENDING: 'SPLIT_PENDING',
  RESERVED: 'RESERVED',
  PARTIALLY_SHIPPED: 'PARTIALLY_SHIPPED',
  SHIPPED: 'SHIPPED',
  BACKORDER: 'BACKORDER',
  CONSOLIDATION_AVAILABLE: 'CONSOLIDATION_AVAILABLE',
  CANCELLED: 'CANCELLED',
} as const;
export type FulfillmentStatus = (typeof FulfillmentStatus)[keyof typeof FulfillmentStatus];

export const OrderStatus = {
  CONFIRMED: 'CONFIRMED',
  SHIPPED: 'SHIPPED',
  INVOICED: 'INVOICED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
/** Stepper on screen 13: Order Confirmed -> Shipped -> Invoiced -> Paid. */
export const ORDER_STEPPER: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
  OrderStatus.INVOICED,
  OrderStatus.PAID,
];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const InvoiceType = { ONE_TIME: 'ONE_TIME', RECURRING: 'RECURRING' } as const;
export type InvoiceType = (typeof InvoiceType)[keyof typeof InvoiceType];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const ProrationRule = {
  NONE: 'NONE',
  PRORATED: 'PRORATED',
  FULL_PERIOD: 'FULL_PERIOD',
} as const;
export type ProrationRule = (typeof ProrationRule)[keyof typeof ProrationRule];

export const AlertType = {
  STALLED_DEAL: 'STALLED_DEAL',
  DISCOUNT_ANOMALY: 'DISCOUNT_ANOMALY',
  DELIVERY_SLIPPAGE: 'DELIVERY_SLIPPAGE',
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export const AlertStatus = {
  OPEN: 'OPEN',
  NUDGED: 'NUDGED',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export const AlertSeverity = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' } as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const AuditEntity = {
  CUSTOMER: 'CUSTOMER',
  QUOTATION: 'QUOTATION',
  APPROVAL: 'APPROVAL',
  ORDER: 'ORDER',
  FULFILLMENT: 'FULFILLMENT',
  INVOICE: 'INVOICE',
  SUBSCRIPTION: 'SUBSCRIPTION',
  PAYMENT: 'PAYMENT',
  CONFIG: 'CONFIG',
  PRODUCT: 'PRODUCT',
  PRICELIST: 'PRICELIST',
  WAREHOUSE: 'WAREHOUSE',
  SUBSCRIPTION_PLAN: 'SUBSCRIPTION_PLAN',
  STOCK: 'STOCK',
  ALERT: 'ALERT',
  NEGOTIATION: 'NEGOTIATION',
  USER: 'USER',
} as const;
export type AuditEntity = (typeof AuditEntity)[keyof typeof AuditEntity];

export const PriceRuleType = {
  NONE: 'NONE',
  PERCENT_OFF_BASE: 'PERCENT_OFF_BASE',
  FIXED_PRICE: 'FIXED_PRICE',
} as const;
export type PriceRuleType = (typeof PriceRuleType)[keyof typeof PriceRuleType];

export const Currency = { USD: 'USD', EUR: 'EUR' } as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const NegotiationEventType = {
  COMMENT: 'COMMENT',
  COUNTER_DISCOUNT: 'COUNTER_DISCOUNT',
  DELIVERY_DATE_REQUEST: 'DELIVERY_DATE_REQUEST',
  QTY_CHANGE_REQUEST: 'QTY_CHANGE_REQUEST',
  REP_REPLY: 'REP_REPLY',
  CONFIRMED: 'CONFIRMED',
} as const;
export type NegotiationEventType = (typeof NegotiationEventType)[keyof typeof NegotiationEventType];

export const ProductStatus = { ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' } as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const LineDiscountStatus = { OK: 'OK', OVER: 'OVER' } as const;
export type LineDiscountStatus = (typeof LineDiscountStatus)[keyof typeof LineDiscountStatus];

export const PaymentMethod = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  CARD: 'CARD',
  CHEQUE: 'CHEQUE',
  CREDIT_NOTE: 'CREDIT_NOTE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  STALE_VERSION: 'STALE_VERSION',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INVALID_STATE: 'INVALID_STATE',
  PORTAL_TOKEN_INVALID: 'PORTAL_TOKEN_INVALID',
  PORTAL_TOKEN_EXPIRED: 'PORTAL_TOKEN_EXPIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
