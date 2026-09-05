/**
 * Request / response DTOs for every endpoint.
 * FROZEN after Phase 3 — see docs/CONTRACT_CHANGELOG.md and docs/API_CONTRACT.md.
 */
import type {
  AlertStatus,
  AlertType,
  ApprovalStatus,
  BillingCycle,
  CustomerTier,
  Currency,
  InvoiceStatus,
  PaymentMethod,
  PriceRuleType,
  ProductCategory,
  ProrationRule,
  QuoteStage,
  Role,
  SubscriptionStatus,
} from '../enums/index.js';
import type { Money } from '../util/money.js';
import type { IsoDate } from '../util/dates.js';
import type {
  ActivityItemDto,
  AlertActionDto,
  AllocationDto,
  ApprovalChainConfigDto,
  ApprovalDto,
  AuditLogDto,
  CreditNoteDto,
  CustomerDto,
  DealAlertDto,
  FulfillmentDto,
  Id,
  InvoiceDto,
  NegotiationEventDto,
  NotificationDto,
  OrderDto,
  PriceListDto,
  PriceListEntryDto,
  ProductDto,
  ProductWarehouseStockDto,
  QuotationDto,
  QuotationSummaryDto,
  ReplenishmentRuleDto,
  RiskAssessmentDto,
  StockDto,
  SubscriptionDto,
  SubscriptionPlanDto,
  UpsellSuggestionDto,
  UserDto,
  WarehouseDto,
} from '../types/entities.js';

/* ------------------------------------------------------------------ auth */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthSessionDto {
  token: string;
  expiresAt: IsoDate;
  user: UserDto;
  /** Portal users only: the quotation their session is scoped to, if any. */
  portalQuotationId?: Id;
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
  /** Required when role === CUSTOMER. */
  customerId?: Id;
  /** Internal signup: the team/company selector on screen 1. */
  team?: string;
}

export interface DemoAccountDto {
  label: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  landingRoute: string;
  description: string;
}

/* ------------------------------------------------------------------ config (screen 18) */

export interface UpdateApprovalConfigRequest {
  tierCeilings?: Partial<Record<CustomerTier, number>>;
  categoryCeilings?: Partial<Record<ProductCategory, number>>;
  thresholds?: Partial<ApprovalChainConfigDto['thresholds']>;
  chains?: Partial<Record<string, Role[]>>;
  dealHealth?: Partial<ApprovalChainConfigDto['dealHealth']>;
  upsell?: Partial<ApprovalChainConfigDto['upsell']>;
  billing?: Partial<ApprovalChainConfigDto['billing']>;
  reason: string;
}

/** Returned after a ceiling change so the UI can show what re-evaluated. */
export interface ConfigChangeImpactDto {
  config: ApprovalChainConfigDto;
  reevaluated: {
    quotationId: Id;
    quotationNumber: string;
    previousScore: number;
    previousLevel: string;
    newScore: number;
    newLevel: string;
    autoApproved: boolean;
  }[];
}

/* ------------------------------------------------------------------ customers */

export interface UpsertCustomerRequest {
  name: string;
  tier: CustomerTier;
  currency?: Currency;
  contactName?: string;
  contactEmail?: string;
  /** The owning sales rep. Required on create; may be reassigned on update. */
  ownerId?: Id;
  active?: boolean;
}

/* ------------------------------------------------------------------ products */

/**
 * An opening stock allocation, typed into the New Product form.
 * Only a stocked category (HARDWARE) accepts these — see `isStockedCategory`.
 */
export interface ProductWarehouseStockInput {
  warehouseId: Id;
  inStock: number;
}

export interface UpsertProductRequest {
  sku?: string;
  name: string;
  category: ProductCategory;
  description?: string;
  unitPrice: Money;
  costPrice: Money;
  unit: string;
  taxPct: number;
  isSubscription: boolean;
  recurringCycle?: BillingCycle;
  quantityOnHand?: number;
  promoted?: boolean;
  variants?: ProductDto['variants'];
  status?: ProductDto['status'];
  /**
   * Opening stock per warehouse, accepted by `POST /products` only, and only
   * for a stocked category. When present it also sets `quantityOnHand`, so the
   * catalogue figure and the warehouses cannot disagree on day one.
   */
  warehouseStock?: ProductWarehouseStockInput[];
}

/**
 * `GET /products/:id/stock` — screen 17's Warehouse Stock card.
 * Every ACTIVE warehouse is listed (plus any inactive one still holding stock),
 * so a hardware product that has never been stocked shows real warehouses at
 * zero rather than an empty table.
 */
export interface ProductStockDto {
  productId: Id;
  productName: string;
  category: ProductCategory;
  /** False for SERVICES and SUBSCRIPTION, where `warehouses` is always empty. */
  stocked: boolean;
  warehouses: ProductWarehouseStockDto[];
  totalInStock: number;
  totalReserved: number;
  totalAvailable: number;
  /** The catalogue figure on the product, for the UI to reconcile against the total. */
  quantityOnHand: number;
}

/* ------------------------------------------------------------------ price lists (screen 17) */

/**
 * Edit a tier's *price rule* — what that tier actually pays.
 * Deliberately separate from the tier's *discount ceiling*, which is governance
 * and lives on screen 18. See docs/DECISIONS.md D-015.
 */
export interface UpdatePriceListRequest {
  name?: string;
  currencies?: Currency[];
  ruleType?: PriceRuleType;
  /** Percent for PERCENT_OFF_BASE (10 === "base minus 10 percent"); ignored for NONE. */
  ruleValue?: number;
  /** Per-product overrides, which beat the rule. Replaces the list when supplied. */
  entries?: PriceListEntryDto[];
  active?: boolean;
  reason: string;
}

/* ------------------------------------------------------------------ warehouses */

export interface UpsertWarehouseRequest {
  code?: string;
  name: string;
  /** Ranking weight for the split planner. LOWER is preferred. */
  shippingCostWeight: number;
  baseShipmentCost: Money;
  perUnitShippingCost: Money;
  replenishmentRule?: Partial<ReplenishmentRuleDto>;
  active?: boolean;
}

/* ------------------------------------------------------------------ subscription plans */

export interface UpsertSubscriptionPlanRequest {
  name: string;
  productId: Id;
  cycle: BillingCycle;
  /** Charged each cycle, per unit. */
  amount: Money;
  prorationRule?: ProrationRule;
  cancellationRule?: ProrationRule;
  active?: boolean;
}

export interface ProductDashboardDto {
  totalActive: number;
  totalArchived: number;
  priceListTiers: number;
  priceListCurrencies: number;
  variantSkuCount: number;
  products: ProductDto[];
}

/* ------------------------------------------------------------------ quotations */

export interface CreateQuotationRequest {
  customerId: Id;
  promisedDeliveryDate?: IsoDate;
  notes?: string;
}

export interface QuotationLineInput {
  /** Omit to add a new line; supply to update an existing one. */
  id?: Id;
  productId: Id;
  qty: number;
  discountPct: number;
  selectedVariants?: Record<string, string>;
  addedFromUpsell?: boolean;
}

export interface UpdateQuotationRequest {
  lines?: QuotationLineInput[];
  promisedDeliveryDate?: IsoDate;
  notes?: string;
  /** Optimistic concurrency: the version the client last read. */
  version: number;
}

/** Server-side preview without persisting — used to keep the UI honest. */
export interface PreviewQuotationRequest {
  customerId: Id;
  lines: QuotationLineInput[];
}

export interface QuotationPreviewDto {
  lines: QuotationDto['lines'];
  totals: QuotationDto['totals'];
  risk: RiskAssessmentDto;
}

export interface SubmitQuotationResponse {
  quotation: QuotationDto;
  /** null when the quote auto-approved (risk NONE). */
  approval: ApprovalDto | null;
  autoApproved: boolean;
  risk: RiskAssessmentDto;
}

export interface QuotationListQuery {
  stage?: QuoteStage;
  ownerId?: Id;
  customerId?: Id;
  view?: 'kanban' | 'table';
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface KanbanBoardDto {
  columns: {
    stage: QuoteStage;
    label: string;
    total: Money;
    /** At most `cardsPerColumn` of them — see `cardCount` for how many there are. */
    cards: QuotationSummaryDto[];
    /** Every quotation in this stage matching the current filter, not just the rendered cards. */
    cardCount: number;
  }[];
}

/* ------------------------------------------------------------------ dashboard (screen 2) */

export interface SalesDashboardDto {
  pendingApprovals: number;
  openQuotations: number;
  atRiskDeals: number;
  recentActivity: ActivityItemDto[];
  myQuotations: QuotationSummaryDto[];
}

/* ------------------------------------------------------------------ approvals */

export interface ApprovalDecisionRequest {
  reason: string;
}

export interface ApprovalListQuery {
  status?: ApprovalStatus;
  pendingOnly?: boolean;
  assignedToMe?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ApprovalListDto {
  counts: { pending: number; returned: number; approved: number; rejected: number };
  items: ApprovalDto[];
}

/**
 * `POST /quotations/:id/portal-link` — reissue a customer magic link.
 * Revokes every live token for the quotation and mints a fresh one. The
 * expiry-message flow (USER_FLOWS §E11) tells the customer to ask for this.
 */
export interface ReissuePortalLinkRequest {
  reason?: string;
}

export interface ReissuePortalLinkResponse {
  token: string;
  /** Relative path the rep can copy to the customer, e.g. `/portal/q/Q-1042?token=…`. */
  url: string;
  expiresAt: IsoDate;
  /** How many previously-live links this reissue revoked. */
  revokedCount: number;
}

/* ------------------------------------------------------------------ notifications */

export interface NotificationListDto {
  items: NotificationDto[];
  unreadCount: number;
}

export interface MarkAllReadResponse {
  updated: number;
}

/* ------------------------------------------------------------------ portal & negotiation */

/** One row of the customer's quotation list in the portal (screen 11a). */
export interface PortalQuotationSummaryDto {
  id: Id;
  number: string;
  stage: QuoteStage;
  currency: Currency;
  grandTotal: Money;
  lineCount: number;
  createdAt: IsoDate;
  lastActivityAt: IsoDate;
  validUntil?: IsoDate;
  promisedDeliveryDate?: IsoDate;
  /** True when the customer can confirm this one right now. */
  canConfirm: boolean;
  /** True when it is sitting in the internal approval chain. */
  awaitingApproval: boolean;
  /** How many negotiation messages exist on this quotation. */
  messageCount: number;
}

/**
 * `GET /portal/quotations` — every quotation this company has been sent.
 * A password login sees the whole list; a magic link still unlocks exactly the
 * one quotation it was minted for, so a link session gets a list of one.
 */
export interface PortalQuotationListResponse {
  customer: CustomerDto;
  items: PortalQuotationSummaryDto[];
  scopedToSingleQuotation: boolean;
}

export interface PortalResolveResponse {
  quotation: QuotationDto;
  customer: CustomerDto;
  events: NegotiationEventDto[];
  canConfirm: boolean;
  /** Banner text explaining that a counter above threshold re-enters approval. */
  negotiationNotice: string;
  /** How many quotations this company has in the portal, this one included. */
  siblingCount: number;
}

export interface PortalCommentRequest {
  lineId?: Id;
  comment: string;
}

export interface PortalCounterRequest {
  /** Per-line counter offers. */
  lines: { lineId: Id; counterDiscountPct?: number; requestedQty?: number; comment?: string }[];
  requestedDeliveryDate?: IsoDate;
  note?: string;
}

export interface PortalCounterResponse {
  quotation: QuotationDto;
  risk: RiskAssessmentDto;
  /** True when the counter pushed the quote back into the approval chain. */
  reEnteredApproval: boolean;
  approval: ApprovalDto | null;
  message: string;
}

export interface PortalConfirmResponse {
  quotation: QuotationDto;
  order: OrderDto | null;
  fulfillment: FulfillmentDto | null;
  reEnteredApproval: boolean;
  approval: ApprovalDto | null;
  message: string;
}

/* ------------------------------------------------------------------ fulfillment */

export interface FulfillmentListDto {
  stock: StockDto[];
  awaiting: {
    orderId: Id;
    orderNumber: string;
    customerName: string;
    status: FulfillmentDto['status'];
    warehouses: string;
    fulfillmentId: Id;
  }[];
}

export interface ManualSplitOverrideRequest {
  allocations: {
    warehouseId: Id;
    lines: { lineId: Id; qty: number }[];
  }[];
  reason: string;
}

export interface AcceptSplitResponse {
  fulfillment: FulfillmentDto;
  stock: StockDto[];
}

export interface AdjustStockRequest {
  warehouseId: Id;
  productId: Id;
  /** Signed delta applied to inStock. */
  delta: number;
  reason: string;
}

/* ------------------------------------------------------------------ billing */

export interface RecordPaymentRequest {
  amount: Money;
  method: PaymentMethod;
  reference?: string;
  receivedAt?: IsoDate;
}

export interface ModifySubscriptionRequest {
  qty?: number;
  planId?: Id;
  effectiveDate?: IsoDate;
  reason: string;
}

export interface ModifySubscriptionResponse {
  subscription: SubscriptionDto;
  proration: {
    credit: Money;
    charge: Money;
    net: Money;
    explanation: string;
  };
  creditNote: CreditNoteDto | null;
}

export interface CancelSubscriptionRequest {
  reason: string;
  effectiveDate?: IsoDate;
}

export interface CancelSubscriptionResponse {
  subscription: SubscriptionDto;
  creditNote: CreditNoteDto | null;
  explanation: string;
}

export interface BillingDetailDto {
  customer: CustomerDto;
  order?: OrderDto;
  oneTimeLines: {
    description: string;
    qty: number;
    total: Money;
  }[];
  recurringLines: {
    subscriptionId: Id;
    planName: string;
    cycle: BillingCycle;
    nextBillDate?: IsoDate;
    amount: Money;
    status: SubscriptionStatus;
  }[];
  invoices: InvoiceDto[];
}

export interface SubscriptionListDto {
  counts: { active: number; paused: number; cancelled: number };
  items: SubscriptionDto[];
}

export interface InvoiceListDto {
  counts: { unpaid: number; paid: number; overdue: number };
  items: InvoiceDto[];
}

/* ------------------------------------------------------------------ deal health */

export interface DealHealthDashboardDto {
  stalledDeals: number;
  discountAnomalies: number;
  deliverySlippage: number;
  alerts: DealAlertDto[];
}

export interface AlertActionRequest {
  note?: string;
}

export interface AlertActionResponse {
  alert: DealAlertDto;
  action: AlertActionDto;
}

export interface DealHealthQuery {
  type?: AlertType;
  status?: AlertStatus;
}

/* ------------------------------------------------------------------ reporting */

export interface ReportingQuery {
  from?: IsoDate;
  to?: IsoDate;
  period?: 'today' | 'week' | 'month' | 'custom';
  repId?: Id;
  approvalStatus?: ApprovalStatus;
  productId?: Id;
  category?: ProductCategory;
}

export interface ReportingDashboardDto {
  quotesCreated: number;
  avgApprovalTimeMs: number;
  avgApprovalTimeLabel: string;
  /** The SLA target the average is judged against (hours). */
  avgApprovalSlaHours: number;
  /** True when there is real data and the average is at or under the SLA target. */
  avgApprovalWithinSla: boolean;
  topUpsellProduct: { productId: Id; name: string; timesAdded: number } | null;
  totalQuotedValue: Money;
  totalConfirmedValue: Money;
  conversionRatePct: number;
  byStage: { stage: QuoteStage; count: number; value: Money }[];
  byRep: { repId: Id; repName: string; quotes: number; value: Money; avgDiscountPct: number }[];
  byProduct: { productId: Id; name: string; qty: number; value: Money; avgDiscountPct: number }[];
  filtersApplied: ReportingQuery;
}

/* ------------------------------------------------------------------ audit */

export interface AuditQuery {
  entity?: string;
  entityId?: Id;
  actorId?: Id;
  page?: number;
  pageSize?: number;
}

/* ------------------------------------------------------------------ re-exports used by the UI */

export type {
  ActivityItemDto,
  AllocationDto,
  ApprovalChainConfigDto,
  ApprovalDto,
  AuditLogDto,
  CreditNoteDto,
  CustomerDto,
  DealAlertDto,
  FulfillmentDto,
  InvoiceDto,
  NegotiationEventDto,
  NotificationDto,
  OrderDto,
  PriceListDto,
  ProductDto,
  QuotationDto,
  QuotationSummaryDto,
  StockDto,
  SubscriptionDto,
  SubscriptionPlanDto,
  UpsellSuggestionDto,
  UserDto,
  WarehouseDto,
  Currency,
  InvoiceStatus,
};
