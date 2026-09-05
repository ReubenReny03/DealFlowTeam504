/**
 * DealFlow360 — entity DTOs (the wire shapes).
 * These are what the API returns and what the UI consumes. Mongo `_id` is always
 * serialised as a string `id`; Mongo Dates are always serialised as ISO-8601 UTC strings.
 * FROZEN after Phase 3 — see docs/CONTRACT_CHANGELOG.md.
 */
import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  AuditEntity,
  BillingCycle,
  Currency,
  CustomerTier,
  FulfillmentStatus,
  InvoiceStatus,
  InvoiceType,
  LineDiscountStatus,
  NegotiationEventType,
  OrderStatus,
  PaymentMethod,
  PriceRuleType,
  ProductCategory,
  ProductStatus,
  ProrationRule,
  QuoteStage,
  RiskLevel,
  Role,
  SubscriptionStatus,
} from '../enums/index.js';
import type { Money } from '../util/money.js';
import type { IsoDate } from '../util/dates.js';

export type Id = string;

export interface Timestamped {
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* ------------------------------------------------------------------ identity */

export interface UserDto extends Timestamped {
  id: Id;
  name: string;
  email: string;
  role: Role;
  /** Present only for Role.CUSTOMER — the company this portal user belongs to. */
  customerId?: Id;
  active: boolean;
  /**
   * True while the account is still on the password an Admin typed for it. Set
   * when the account is created, cleared the moment the user sets their own. The
   * sign-in flow offers them the chance to change it; skipping leaves the flag
   * set, so they are asked again next time.
   */
  mustChangePassword: boolean;
  /** Route the UI sends this user to immediately after login. */
  landingRoute: string;
}

export interface CustomerDto extends Timestamped {
  id: Id;
  name: string;
  tier: CustomerTier;
  currency: Currency;
  priceListId: Id;
  contactName: string;
  contactEmail: string;
  /** Owning sales rep. */
  ownerId: Id;
  active: boolean;
}

/* ------------------------------------------------------------------ catalogue */

export interface ProductVariantValueDto {
  value: string;
  /** Added to the base unit price when this value is selected. Money, may be 0. */
  extraPrice: Money;
}

export interface ProductVariantDto {
  /** e.g. "Color", "RAM", "Manufacturer" */
  attribute: string;
  values: ProductVariantValueDto[];
}

export interface ProductDto extends Timestamped {
  id: Id;
  sku: string;
  name: string;
  category: ProductCategory;
  description: string;
  /** Base list price in minor units, before any price-list rule. */
  unitPrice: Money;
  /** What it costs us. Drives the margin indicator and the upsell ranking. */
  costPrice: Money;
  unit: string;
  taxPct: number;
  isSubscription: boolean;
  /** Only meaningful when isSubscription === true. */
  recurringCycle?: BillingCycle;
  quantityOnHand: number;
  status: ProductStatus;
  /** Marked as promoted -> ranks higher in the upsell panel. */
  promoted: boolean;
  variants: ProductVariantDto[];
}

export interface PriceListEntryDto {
  productId: Id;
  /** Overrides the rule for this one product when present. */
  price: Money;
}

export interface PriceListDto extends Timestamped {
  id: Id;
  name: string;
  tier: CustomerTier;
  currencies: Currency[];
  ruleType: PriceRuleType;
  /** Percent for PERCENT_OFF_BASE (10 === "base minus 10 percent"); ignored for NONE. */
  ruleValue: number;
  /** Per-product overrides. */
  entries: PriceListEntryDto[];
  active: boolean;
}

/* ------------------------------------------------------------------ inventory */

export interface ReplenishmentRuleDto {
  leadTimeDays: number;
  reorderPoint: number;
  reorderQty: number;
}

export interface WarehouseDto extends Timestamped {
  id: Id;
  code: string;
  name: string;
  /** Ranking weight used by the split planner. LOWER is preferred. */
  shippingCostWeight: number;
  /** Fixed cost of despatching one shipment from here. */
  baseShipmentCost: Money;
  /** Marginal cost per unit shipped from here. */
  perUnitShippingCost: Money;
  replenishmentRule: ReplenishmentRuleDto;
  active: boolean;
}

export interface StockDto extends Timestamped {
  id: Id;
  warehouseId: Id;
  warehouseName: string;
  productId: Id;
  productName: string;
  inStock: number;
  reserved: number;
  /** Always `inStock - reserved`. Persisted for query speed, recomputed on every write. */
  available: number;
  /** Set when a replenishment is inbound; feeds the backorder ETA. */
  incomingEta?: IsoDate;
}

/**
 * One warehouse's holding of a single product, as screen 17's Warehouse Stock
 * card renders it. A warehouse with no `Stock` row yet is still returned, with
 * zeroes — "we hold none here" and "we have never stocked it here" look the
 * same to a buyer, and the row is where an opening allocation gets typed.
 */
export interface ProductWarehouseStockDto {
  warehouseId: Id;
  warehouseCode: string;
  warehouseName: string;
  /** False for a decommissioned warehouse that still holds stock. */
  warehouseActive: boolean;
  inStock: number;
  reserved: number;
  /** Always `inStock - reserved`. */
  available: number;
  /** Set when a replenishment is inbound; feeds the backorder ETA. */
  incomingEta?: IsoDate;
}

/* ------------------------------------------------------------------ configuration */

export interface RiskThresholdsDto {
  /** Lowest score that still requires a Sales Manager. Default 1. */
  mediumMinScore: number;
  /** Lowest score that requires Sales Manager AND Finance. Default 30. */
  highMinScore: number;
  /** A single line this many points over its limit forces HIGH regardless of score. Default 8. */
  hardEscalationMaxSingleOver: number;
  /** Weight applied to the revenue-weighted average overage. Default 7. */
  blendedWeight: number;
  /** Weight applied to the worst single line. Default 3. */
  maxSingleWeight: number;
}

export interface DealHealthConfigDto {
  stalledDays: number;
  anomalyMultiplier: number;
  /** Absolute discount % above which a quote is anomalous regardless of the rep average. */
  anomalyAbsoluteCapPct: number;
  /** How many past quotations form a rep's trailing average. */
  trailingWindow: number;
}

export interface UpsellConfigDto {
  /** score = coPurchaseFrequency*w1 + isPromoted*w2 + normalizedMarginDelta*w3 */
  coPurchaseWeight: number;
  promotedWeight: number;
  marginWeight: number;
  /** Suggestions below this margin delta (minor units) are filtered out entirely. */
  minMarginThreshold: Money;
  maxSuggestions: number;
}

export interface BillingConfigDto {
  defaultProrationRule: ProrationRule;
  cancellationRule: ProrationRule;
  /** How many future occurrences the billing schedule pre-generates. */
  scheduleHorizon: number;
  invoiceDueDays: number;
}

/**
 * Screen 18. Singleton document, id === 'default'.
 * Everything the risk engine and the approval router read comes from here —
 * change a ceiling and every open quotation re-evaluates. Nothing is hardcoded.
 */
export interface ApprovalChainConfigDto extends Timestamped {
  id: Id;
  tierCeilings: Record<CustomerTier, number>;
  categoryCeilings: Record<ProductCategory, number>;
  thresholds: RiskThresholdsDto;
  /** Which roles must approve, per resolved risk level. */
  chains: Record<RiskLevel, Role[]>;
  dealHealth: DealHealthConfigDto;
  upsell: UpsellConfigDto;
  billing: BillingConfigDto;
  updatedBy?: string;
}

export interface SubscriptionPlanDto extends Timestamped {
  id: Id;
  name: string;
  productId: Id;
  cycle: BillingCycle;
  /** Amount charged each cycle, per unit. */
  amount: Money;
  prorationRule: ProrationRule;
  cancellationRule: ProrationRule;
  active: boolean;
}

/* ------------------------------------------------------------------ quotation */

export interface QuotationLineDto {
  id: Id;
  productId: Id;
  productName: string;
  sku: string;
  category: ProductCategory;
  qty: number;
  /** Resolved from the customer's price list at the time the line was added. */
  unitPrice: Money;
  costPrice: Money;
  discountPct: number;
  /** min(tierCeiling, categoryCeiling) — computed, never user-entered. */
  allowedDiscountPct: number;
  taxPct: number;
  isSubscription: boolean;
  recurringCycle?: BillingCycle;
  selectedVariants?: Record<string, string>;
  /** How this line got here — drives the "added from upsell" badge. */
  addedFromUpsell?: boolean;

  /* --- computed by computeLinePricing, persisted so lists need no recompute --- */
  lineGross: Money;
  lineDiscount: Money;
  lineNet: Money;
  lineTax: Money;
  lineTotal: Money;
  lineCost: Money;
  lineMargin: Money;
  marginPct: number;
  /** OK / OVER — what screen 4's Status column renders. */
  discountStatus: LineDiscountStatus;
  overByPts: number;
}

export interface QuoteTotalsDto {
  subtotal: Money;
  discountTotal: Money;
  netTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  costTotal: Money;
  marginTotal: Money;
  marginPct: number;
  /** Totals restricted to non-subscription lines — what the one-time invoice bills. */
  oneTimeTotal: Money;
  /** Sum of one cycle of every recurring line. */
  recurringTotal: Money;
}

export interface RiskExplanationRowDto {
  lineId: Id;
  /** "Laptop Pro 14" */
  line: string;
  /** "Hardware" — screen 6 shows "Laptop/Hardware". */
  category: ProductCategory;
  given: number;
  allowed: number;
  overBy: number;
  status: LineDiscountStatus;
  /** Revenue weight this line carried in the blended average, 0..1. */
  weight: number;
}

export interface RiskAssessmentDto {
  riskScore: number;
  riskLevel: RiskLevel;
  blendedOverPct: number;
  maxSingleOver: number;
  requiredChain: Role[];
  /** Rendered verbatim by screen 6's "Why This Quote Was Flagged" table. Never recomputed in the UI. */
  explanation: RiskExplanationRowDto[];
  /** One-sentence human summary, e.g. "1 of 2 lines is over its limit; worst line is 8 points over." */
  summary: string;
  /** Snapshot of the ceilings used, so an old assessment stays explainable after config changes. */
  ceilingsUsed: { tier: CustomerTier; tierCeiling: number; categoryCeilings: Record<ProductCategory, number> };
}

export interface QuotationDto extends Timestamped {
  id: Id;
  number: string;
  customerId: Id;
  customerName: string;
  tier: CustomerTier;
  priceListId: Id;
  currency: Currency;
  ownerId: Id;
  ownerName: string;
  stage: QuoteStage;
  lines: QuotationLineDto[];
  totals: QuoteTotalsDto;
  risk: RiskAssessmentDto;
  approvalId?: Id;
  orderId?: Id;
  validUntil: IsoDate;
  promisedDeliveryDate?: IsoDate;
  /** Any human touch — edit, comment, approval action. Drives the stalled-deal rule. */
  lastActivityAt: IsoDate;
  submittedAt?: IsoDate;
  /** Optimistic-concurrency guard. Every write must send the version it read. */
  version: number;
  notes?: string;
}

/** Card shape for the Kanban board and the table view (screen 3). */
export interface QuotationSummaryDto {
  id: Id;
  number: string;
  customerName: string;
  tier: CustomerTier;
  ownerName: string;
  stage: QuoteStage;
  grandTotal: Money;
  currency: Currency;
  riskLevel: RiskLevel;
  riskScore: number;
  lastActivityAt: IsoDate;
  updatedAt: IsoDate;
  lineCount: number;
}

/* ------------------------------------------------------------------ approvals */

export interface ApprovalStepDto {
  role: Role;
  status: ApprovalStepStatus;
  actorId?: Id;
  actorName?: string;
  action?: ApprovalAction;
  reason?: string;
  actedAt?: IsoDate;
  /** When this step became ACTIVE — the SLA clock start. */
  activatedAt?: IsoDate;
}

export interface ApprovalTrailEntryDto {
  actorId: Id;
  actorName: string;
  role: Role;
  action: ApprovalAction;
  reason: string;
  at: IsoDate;
}

export interface ApprovalDto extends Timestamped {
  id: Id;
  quotationId: Id;
  quotationNumber: string;
  customerId: Id;
  customerName: string;
  tier: CustomerTier;
  ownerId: Id;
  ownerName: string;
  amount: Money;
  currency: Currency;
  status: ApprovalStatus;
  /** Risk snapshot taken at submit time. Recomputed (and re-snapshotted) on every resubmit. */
  risk: RiskAssessmentDto;
  steps: ApprovalStepDto[];
  /** Index into `steps` of the ACTIVE step, or -1 when finished. */
  currentStepIndex: number;
  /** The role currently holding the ball, for the Approvals list "Stage" column. */
  currentStage?: Role;
  /** Display name of the person the active step is waiting on. */
  assignedToName?: string;
  trail: ApprovalTrailEntryDto[];
  submittedAt: IsoDate;
  decidedAt?: IsoDate;
  /** decidedAt - submittedAt in ms. Feeds the "Avg Approval Time" KPI. */
  cycleTimeMs?: number;
  /** True when this approval was created by a customer negotiation rather than a rep submit. */
  reEnteredFromNegotiation: boolean;
}

/* ------------------------------------------------------------------ audit */

export interface AuditLogDto {
  id: Id;
  actor: string;
  actorId: Id;
  role: Role;
  action: string;
  entity: AuditEntity;
  entityId: Id;
  /** Human label of the entity, e.g. "Q-1042", so the trail is readable without a join. */
  entityLabel?: string;
  before?: unknown;
  after?: unknown;
  reason: string;
  timestamp: IsoDate;
}

/* ------------------------------------------------------------------ portal / negotiation */

export interface PortalTokenDto {
  id: Id;
  token: string;
  quotationId: Id;
  customerId: Id;
  userId: Id;
  expiresAt: IsoDate;
  revoked: boolean;
  lastUsedAt?: IsoDate;
}

export interface NegotiationEventDto {
  id: Id;
  quotationId: Id;
  lineId?: Id;
  lineName?: string;
  type: NegotiationEventType;
  authorId: Id;
  authorName: string;
  /** true when written by the customer, false when written by the rep. */
  fromCustomer: boolean;
  comment?: string;
  counterDiscountPct?: number;
  requestedDeliveryDate?: IsoDate;
  requestedQty?: number;
  createdAt: IsoDate;
}

/* ------------------------------------------------------------------ order & fulfillment */

export interface OrderLineDto {
  lineId: Id;
  productId: Id;
  productName: string;
  category: ProductCategory;
  qty: number;
  qtyShipped: number;
  qtyInvoiced: number;
  unitPrice: Money;
  discountPct: number;
  lineNet: Money;
  lineTax: Money;
  lineTotal: Money;
  isSubscription: boolean;
  recurringCycle?: BillingCycle;
}

export interface OrderDto extends Timestamped {
  id: Id;
  number: string;
  quotationId: Id;
  quotationNumber: string;
  customerId: Id;
  customerName: string;
  ownerId: Id;
  currency: Currency;
  status: OrderStatus;
  lines: OrderLineDto[];
  totals: QuoteTotalsDto;
  confirmedAt: IsoDate;
  promisedDeliveryDate?: IsoDate;
  projectedDeliveryDate?: IsoDate;
  fulfillmentId?: Id;
}

export interface AllocationLineDto {
  lineId: Id;
  productId: Id;
  productName: string;
  qty: number;
}

export interface AllocationDto {
  warehouseId: Id;
  warehouseName: string;
  lines: AllocationLineDto[];
  /** Total units allocated to this warehouse — screen 8's "Qty Fulfilled". */
  qty: number;
  estShipments: number;
  estCost: Money;
  shipped: boolean;
  shippedAt?: IsoDate;
}

export interface BackorderDto {
  lineId: Id;
  productId: Id;
  productName: string;
  qty: number;
  /** Warehouse expected to replenish first. */
  warehouseId?: Id;
  warehouseName?: string;
  etaDate?: IsoDate;
}

export interface FulfillmentDto extends Timestamped {
  id: Id;
  orderId: Id;
  orderNumber: string;
  customerId: Id;
  customerName: string;
  status: FulfillmentStatus;
  allocations: AllocationDto[];
  backorders: BackorderDto[];
  totalShipments: number;
  totalCost: Money;
  /** Plain-English justification shown to judges. Never empty. */
  rationale: string[];
  /** True when a human replaced the suggested split. */
  overridden: boolean;
  overriddenBy?: string;
  overrideReason?: string;
  /** Set when a restock now covers the backorder — drives screen 8's auto-prompt banner. */
  consolidationAvailableAt?: IsoDate;
}

/* ------------------------------------------------------------------ billing */

export interface BillingScheduleEntryDto {
  seq: number;
  dueDate: IsoDate;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amount: Money;
  invoiced: boolean;
  invoiceId?: Id;
}

export interface SubscriptionDto extends Timestamped {
  id: Id;
  number: string;
  customerId: Id;
  customerName: string;
  orderId?: Id;
  orderNumber?: string;
  planId: Id;
  planName: string;
  productId: Id;
  cycle: BillingCycle;
  qty: number;
  /** Per-unit, per-cycle amount after discount. */
  unitAmount: Money;
  /** unitAmount * qty. */
  amount: Money;
  currency: Currency;
  status: SubscriptionStatus;
  startDate: IsoDate;
  nextBillDate?: IsoDate;
  cancelledAt?: IsoDate;
  endDate?: IsoDate;
  prorationRule: ProrationRule;
  cancellationRule: ProrationRule;
  schedule: BillingScheduleEntryDto[];
}

export interface InvoiceLineDto {
  lineId: Id;
  productId: Id;
  description: string;
  qty: number;
  unitPrice: Money;
  discountPct: number;
  net: Money;
  tax: Money;
  total: Money;
}

export interface PaymentDto {
  id: Id;
  amount: Money;
  method: PaymentMethod;
  reference?: string;
  receivedAt: IsoDate;
  recordedById: Id;
  recordedByName: string;
}

export interface InvoiceDto extends Timestamped {
  id: Id;
  number: string;
  type: InvoiceType;
  customerId: Id;
  customerName: string;
  orderId?: Id;
  orderNumber?: string;
  subscriptionId?: Id;
  currency: Currency;
  status: InvoiceStatus;
  lines: InvoiceLineDto[];
  subtotal: Money;
  taxTotal: Money;
  total: Money;
  amountPaid: Money;
  amountDue: Money;
  issueDate: IsoDate;
  dueDate: IsoDate;
  /** Recurring invoices only. */
  periodStart?: IsoDate;
  periodEnd?: IsoDate;
  payments: PaymentDto[];
}

export interface CreditNoteDto extends Timestamped {
  id: Id;
  number: string;
  customerId: Id;
  customerName: string;
  subscriptionId?: Id;
  invoiceId?: Id;
  amount: Money;
  currency: Currency;
  reason: string;
  issuedAt: IsoDate;
}

/* ------------------------------------------------------------------ upsell */

export interface UpsellSuggestionDto {
  productId: Id;
  name: string;
  sku: string;
  category: ProductCategory;
  unitPrice: Money;
  /** Margin this line would add to the quote, in minor units. Screen 4's "Margin +$18". */
  marginDelta: Money;
  /** e.g. "Promo, 12% off" */
  promoTag?: string;
  /** Human explanation: "Bought with Laptop Pro 14 in 78% of past deals". */
  reason: string;
  score: number;
}

export interface ProductPairingDto {
  id: Id;
  productId: Id;
  suggestedProductId: Id;
  /** 0..1 — share of past orders containing `productId` that also contained the suggestion. */
  coPurchaseFrequency: number;
}

/* ------------------------------------------------------------------ deal health & alerts */

export interface AlertActionDto {
  action: 'NUDGE' | 'ESCALATE';
  actorId: Id;
  actorName: string;
  at: IsoDate;
  note?: string;
}

export interface DealAlertDto extends Timestamped {
  id: Id;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  quotationId?: Id;
  quotationNumber?: string;
  orderId?: Id;
  customerId: Id;
  customerName: string;
  ownerId: Id;
  ownerName: string;
  /** "Q-1030" or "Delta LLC" — screen 14's "Deal" column. */
  entityLabel: string;
  /** "idle 9 days" / "discount 32% vs avg 8%" — screen 14's "Issue" column. */
  issue: string;
  detail: string;
  flaggedAt: IsoDate;
  actions: AlertActionDto[];
}

export interface NotificationDto {
  id: Id;
  userId: Id;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: IsoDate;
}

/* ------------------------------------------------------------------ activity feed */

export interface ActivityItemDto {
  id: Id;
  /** "approved by Finance", "discount change requested", "stock updated for order" */
  title: string;
  detail: string;
  actorName: string;
  entity: AuditEntity;
  entityId: Id;
  entityLabel: string;
  link?: string;
  at: IsoDate;
}
