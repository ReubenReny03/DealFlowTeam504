/**
 * Mongoose models for DealFlow360.
 *
 * Conventions:
 *  - `_id` is a real ObjectId; the seed pins them so every run is reproducible.
 *  - Money is stored as an integer number of minor units. Never a Double.
 *  - Dates are stored as Date and serialised to ISO-8601 UTC by `toDto`.
 *  - Every model declares its indexes here, and `syncAllIndexes()` builds them
 *    explicitly during reset so no query ever silently falls back to a scan.
 */
import { Schema, model, type Model, type SchemaOptions } from 'mongoose';
import {
  ALL_ROLES,
  AlertSeverity,
  AlertStatus,
  AlertType,
  ApprovalAction,
  ApprovalStatus,
  ApprovalStepStatus,
  AuditEntity,
  BillingCycle,
  CustomerTier,
  Currency,
  FulfillmentStatus,
  InvoiceStatus,
  InvoiceType,
  LineDiscountStatus,
  NegotiationEventType,
  NotificationSeverity,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PriceRuleType,
  ProductCategory,
  ProductStatus,
  ProrationRule,
  QuoteStage,
  RiskLevel,
  SubscriptionStatus,
} from '@dealflow/shared';

const vals = (o: Record<string, string>) => Object.values(o);
const opts: SchemaOptions = { timestamps: true, versionKey: false };
const MONEY = { type: Number, required: true, default: 0 };

/* ------------------------------------------------------------------ identity */

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ALL_ROLES, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    active: { type: Boolean, default: true },
    /** Still on the password an Admin typed for them. Cleared when they set their own. */
    mustChangePassword: { type: Boolean, default: false },
    /** Rolling average discount % across this rep's recent quotes; feeds the anomaly rule. */
    trailingAvgDiscountPct: { type: Number, default: 0 },
  },
  opts,
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, active: 1 });

const customerSchema = new Schema(
  {
    name: { type: String, required: true },
    tier: { type: String, enum: vals(CustomerTier), required: true },
    currency: { type: String, enum: vals(Currency), default: Currency.USD },
    priceListId: { type: Schema.Types.ObjectId, ref: 'PriceList', required: true },
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, default: true },
  },
  opts,
);
customerSchema.index({ name: 1 }, { unique: true });
customerSchema.index({ ownerId: 1, tier: 1 });

/* ------------------------------------------------------------------ catalogue */

const variantSchema = new Schema(
  {
    attribute: { type: String, required: true },
    values: [{ _id: false, value: String, extraPrice: Number }],
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, enum: vals(ProductCategory), required: true },
    description: { type: String, default: '' },
    unitPrice: MONEY,
    costPrice: MONEY,
    unit: { type: String, default: 'Each' },
    taxPct: { type: Number, default: 15 },
    isSubscription: { type: Boolean, default: false },
    recurringCycle: { type: String, enum: vals(BillingCycle) },
    quantityOnHand: { type: Number, default: 0 },
    status: { type: String, enum: vals(ProductStatus), default: ProductStatus.ACTIVE },
    promoted: { type: Boolean, default: false },
    promoTag: { type: String },
    variants: [variantSchema],
  },
  opts,
);
productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ name: 'text', description: 'text' });

const priceListSchema = new Schema(
  {
    name: { type: String, required: true },
    tier: { type: String, enum: vals(CustomerTier), required: true },
    currencies: [{ type: String, enum: vals(Currency) }],
    ruleType: { type: String, enum: vals(PriceRuleType), default: PriceRuleType.NONE },
    ruleValue: { type: Number, default: 0 },
    entries: [{ _id: false, productId: { type: Schema.Types.ObjectId, ref: 'Product' }, price: Number }],
    active: { type: Boolean, default: true },
  },
  opts,
);
priceListSchema.index({ tier: 1 }, { unique: true });

const productPairingSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    suggestedProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    coPurchaseFrequency: { type: Number, default: 0 },
  },
  opts,
);
productPairingSchema.index({ productId: 1, suggestedProductId: 1 }, { unique: true });

/* ------------------------------------------------------------------ inventory */

const warehouseSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    shippingCostWeight: { type: Number, default: 1 },
    baseShipmentCost: MONEY,
    perUnitShippingCost: MONEY,
    replenishmentRule: {
      leadTimeDays: { type: Number, default: 7 },
      reorderPoint: { type: Number, default: 10 },
      reorderQty: { type: Number, default: 50 },
    },
    active: { type: Boolean, default: true },
  },
  opts,
);
warehouseSchema.index({ code: 1 }, { unique: true });

const stockSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    inStock: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    /** Denormalised `inStock - reserved`, kept in step by the pre-validate hook below. */
    available: { type: Number, default: 0 },
    incomingEta: { type: Date },
  },
  opts,
);
stockSchema.index({ warehouseId: 1, productId: 1 }, { unique: true });
stockSchema.index({ productId: 1, available: -1 });
stockSchema.pre('validate', function (next) {
  // Invariant: available is never anything other than inStock - reserved.
  (this as any).available = Math.max(0, (this as any).inStock - (this as any).reserved);
  next();
});

/* ------------------------------------------------------------------ configuration */

const approvalChainConfigSchema = new Schema(
  {
    key: { type: String, default: 'default' },
    tierCeilings: { type: Map, of: Number, required: true },
    categoryCeilings: { type: Map, of: Number, required: true },
    thresholds: {
      mediumMinScore: { type: Number, default: 1 },
      highMinScore: { type: Number, default: 30 },
      hardEscalationMaxSingleOver: { type: Number, default: 8 },
      blendedWeight: { type: Number, default: 7 },
      maxSingleWeight: { type: Number, default: 3 },
    },
    chains: { type: Map, of: [String], required: true },
    dealHealth: {
      stalledDays: { type: Number, default: 7 },
      anomalyMultiplier: { type: Number, default: 2 },
      anomalyAbsoluteCapPct: { type: Number, default: 25 },
      trailingWindow: { type: Number, default: 20 },
    },
    upsell: {
      coPurchaseWeight: { type: Number, default: 0.5 },
      promotedWeight: { type: Number, default: 0.2 },
      marginWeight: { type: Number, default: 0.3 },
      minMarginThreshold: { type: Number, default: 0 },
      maxSuggestions: { type: Number, default: 3 },
    },
    billing: {
      defaultProrationRule: { type: String, enum: vals(ProrationRule), default: ProrationRule.PRORATED },
      cancellationRule: { type: String, enum: vals(ProrationRule), default: ProrationRule.PRORATED },
      scheduleHorizon: { type: Number, default: 12 },
      invoiceDueDays: { type: Number, default: 15 },
    },
    updatedBy: { type: String },
  },
  opts,
);
approvalChainConfigSchema.index({ key: 1 }, { unique: true });

const subscriptionPlanSchema = new Schema(
  {
    name: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    cycle: { type: String, enum: vals(BillingCycle), required: true },
    amount: MONEY,
    prorationRule: { type: String, enum: vals(ProrationRule), default: ProrationRule.PRORATED },
    cancellationRule: { type: String, enum: vals(ProrationRule), default: ProrationRule.PRORATED },
    active: { type: Boolean, default: true },
  },
  opts,
);
subscriptionPlanSchema.index({ name: 1 }, { unique: true });

/* ------------------------------------------------------------------ quotation */

const quotationLineSchema = new Schema(
  {
    lineId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: String,
    sku: String,
    category: { type: String, enum: vals(ProductCategory) },
    qty: { type: Number, default: 1 },
    unitPrice: MONEY,
    costPrice: MONEY,
    discountPct: { type: Number, default: 0 },
    allowedDiscountPct: { type: Number, default: 0 },
    taxPct: { type: Number, default: 15 },
    isSubscription: { type: Boolean, default: false },
    recurringCycle: { type: String, enum: vals(BillingCycle) },
    selectedVariants: { type: Map, of: String },
    addedFromUpsell: { type: Boolean, default: false },
    lineGross: MONEY,
    lineDiscount: MONEY,
    lineNet: MONEY,
    lineTax: MONEY,
    lineTotal: MONEY,
    lineCost: MONEY,
    lineMargin: MONEY,
    marginPct: { type: Number, default: 0 },
    discountStatus: { type: String, enum: vals(LineDiscountStatus), default: LineDiscountStatus.OK },
    overByPts: { type: Number, default: 0 },
  },
  { _id: false },
);

const riskExplanationSchema = new Schema(
  {
    lineId: String,
    line: String,
    category: { type: String, enum: vals(ProductCategory) },
    given: Number,
    allowed: Number,
    overBy: Number,
    status: { type: String, enum: vals(LineDiscountStatus) },
    weight: Number,
  },
  { _id: false },
);

const riskSchema = new Schema(
  {
    riskScore: { type: Number, default: 0 },
    riskLevel: { type: String, enum: vals(RiskLevel), default: RiskLevel.NONE },
    blendedOverPct: { type: Number, default: 0 },
    maxSingleOver: { type: Number, default: 0 },
    requiredChain: [{ type: String, enum: ALL_ROLES }],
    explanation: [riskExplanationSchema],
    summary: { type: String, default: '' },
    ceilingsUsed: {
      tier: { type: String, enum: vals(CustomerTier) },
      tierCeiling: Number,
      categoryCeilings: { type: Map, of: Number },
    },
  },
  { _id: false },
);

const totalsSchema = new Schema(
  {
    subtotal: MONEY, discountTotal: MONEY, netTotal: MONEY, taxTotal: MONEY, grandTotal: MONEY,
    costTotal: MONEY, marginTotal: MONEY, marginPct: { type: Number, default: 0 },
    oneTimeTotal: MONEY, recurringTotal: MONEY,
  },
  { _id: false },
);

const quotationSchema = new Schema(
  {
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    tier: { type: String, enum: vals(CustomerTier) },
    priceListId: { type: Schema.Types.ObjectId, ref: 'PriceList' },
    currency: { type: String, enum: vals(Currency), default: Currency.USD },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ownerName: String,
    stage: { type: String, enum: vals(QuoteStage), default: QuoteStage.DRAFT },
    lines: [quotationLineSchema],
    totals: { type: totalsSchema, default: () => ({}) },
    risk: { type: riskSchema, default: () => ({}) },
    approvalId: { type: Schema.Types.ObjectId, ref: 'Approval' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    validUntil: Date,
    promisedDeliveryDate: Date,
    lastActivityAt: { type: Date, default: Date.now },
    submittedAt: Date,
    /** Optimistic-concurrency guard. Bumped on every persisted mutation. */
    version: { type: Number, default: 1 },
    notes: String,
  },
  opts,
);
quotationSchema.index({ number: 1 }, { unique: true });
quotationSchema.index({ stage: 1, lastActivityAt: -1 });
quotationSchema.index({ ownerId: 1, stage: 1 });
quotationSchema.index({ customerId: 1, createdAt: -1 });
quotationSchema.index({ 'risk.riskLevel': 1 });

/* ------------------------------------------------------------------ approvals & audit */

const approvalStepSchema = new Schema(
  {
    role: { type: String, enum: ALL_ROLES, required: true },
    status: { type: String, enum: vals(ApprovalStepStatus), default: ApprovalStepStatus.PENDING },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    action: { type: String, enum: vals(ApprovalAction) },
    reason: String,
    actedAt: Date,
    activatedAt: Date,
  },
  { _id: false },
);

const approvalTrailSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    role: { type: String, enum: ALL_ROLES },
    action: { type: String, enum: vals(ApprovalAction) },
    reason: String,
    at: Date,
  },
  { _id: false },
);

const approvalSchema = new Schema(
  {
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true },
    quotationNumber: String,
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: String,
    tier: { type: String, enum: vals(CustomerTier) },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    ownerName: String,
    amount: MONEY,
    currency: { type: String, enum: vals(Currency), default: Currency.USD },
    status: { type: String, enum: vals(ApprovalStatus), default: ApprovalStatus.PENDING },
    risk: { type: riskSchema, default: () => ({}) },
    steps: [approvalStepSchema],
    currentStepIndex: { type: Number, default: 0 },
    currentStage: { type: String, enum: ALL_ROLES },
    assignedToName: String,
    trail: [approvalTrailSchema],
    submittedAt: { type: Date, default: Date.now },
    decidedAt: Date,
    cycleTimeMs: Number,
    reEnteredFromNegotiation: { type: Boolean, default: false },
  },
  opts,
);
approvalSchema.index({ quotationId: 1, createdAt: -1 });
approvalSchema.index({ status: 1, currentStage: 1 });
approvalSchema.index({ submittedAt: -1 });

const auditLogSchema = new Schema(
  {
    actor: String,
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ALL_ROLES },
    action: { type: String, required: true },
    entity: { type: String, enum: vals(AuditEntity), required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    entityLabel: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    reason: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false } as SchemaOptions,
);
auditLogSchema.index({ entity: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });

/* ------------------------------------------------------------------ portal & negotiation */

const portalTokenSchema = new Schema(
  {
    token: { type: String, required: true },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
    lastUsedAt: Date,
  },
  opts,
);
portalTokenSchema.index({ token: 1 }, { unique: true });
portalTokenSchema.index({ quotationId: 1, customerId: 1 });

const negotiationEventSchema = new Schema(
  {
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true },
    lineId: String,
    lineName: String,
    type: { type: String, enum: vals(NegotiationEventType), required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
    fromCustomer: { type: Boolean, default: true },
    comment: String,
    counterDiscountPct: Number,
    requestedDeliveryDate: Date,
    requestedQty: Number,
  },
  opts,
);
negotiationEventSchema.index({ quotationId: 1, createdAt: 1 });

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: vals(NotificationType), required: true },
    title: String,
    body: String,
    link: String,
    read: { type: Boolean, default: false },
    severity: { type: String, enum: vals(NotificationSeverity), default: NotificationSeverity.INFO },
    entity: { type: String, enum: vals(AuditEntity) },
    entityId: String,
    entityLabel: String,
    actorName: String,
  },
  opts,
);
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
// The bell's own query: newest first, scoped to one person. Without this the
// list scans every notification in the system to find one user's twenty.
notificationSchema.index({ userId: 1, createdAt: -1 });

/* ------------------------------------------------------------------ order & fulfillment */

const orderLineSchema = new Schema(
  {
    lineId: String,
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    productName: String,
    category: { type: String, enum: vals(ProductCategory) },
    qty: Number,
    qtyShipped: { type: Number, default: 0 },
    qtyInvoiced: { type: Number, default: 0 },
    unitPrice: MONEY,
    discountPct: { type: Number, default: 0 },
    taxPct: { type: Number, default: 15 },
    lineNet: MONEY,
    lineTax: MONEY,
    lineTotal: MONEY,
    isSubscription: { type: Boolean, default: false },
    recurringCycle: { type: String, enum: vals(BillingCycle) },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    number: { type: String, required: true },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true },
    quotationNumber: String,
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    currency: { type: String, enum: vals(Currency), default: Currency.USD },
    status: { type: String, enum: vals(OrderStatus), default: OrderStatus.CONFIRMED },
    lines: [orderLineSchema],
    totals: { type: totalsSchema, default: () => ({}) },
    confirmedAt: { type: Date, default: Date.now },
    promisedDeliveryDate: Date,
    projectedDeliveryDate: Date,
    fulfillmentId: { type: Schema.Types.ObjectId, ref: 'Fulfillment' },
  },
  opts,
);
orderSchema.index({ number: 1 }, { unique: true });
orderSchema.index({ customerId: 1, confirmedAt: -1 });
orderSchema.index({ status: 1 });

const allocationSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    warehouseName: String,
    lines: [{ _id: false, lineId: String, productId: { type: Schema.Types.ObjectId, ref: 'Product' }, productName: String, qty: Number }],
    qty: Number,
    estShipments: { type: Number, default: 1 },
    estCost: MONEY,
    shipped: { type: Boolean, default: false },
    shippedAt: Date,
  },
  { _id: false },
);

const fulfillmentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: String,
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: String,
    status: { type: String, enum: vals(FulfillmentStatus), default: FulfillmentStatus.SPLIT_PENDING },
    allocations: [allocationSchema],
    backorders: [
      {
        _id: false,
        lineId: String,
        productId: { type: Schema.Types.ObjectId, ref: 'Product' },
        productName: String,
        qty: Number,
        warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
        warehouseName: String,
        etaDate: Date,
      },
    ],
    totalShipments: { type: Number, default: 0 },
    totalCost: MONEY,
    rationale: [String],
    /** True once the current allocations are actually reserved against stock (post accept/override), so a later replan or override knows whether to release them first. */
    reserved: { type: Boolean, default: false },
    overridden: { type: Boolean, default: false },
    overriddenBy: String,
    overrideReason: String,
    consolidationAvailableAt: Date,
  },
  opts,
);
fulfillmentSchema.index({ orderId: 1 }, { unique: true });
fulfillmentSchema.index({ status: 1, createdAt: -1 });

/* ------------------------------------------------------------------ billing */

const scheduleEntrySchema = new Schema(
  {
    seq: Number,
    dueDate: Date,
    periodStart: Date,
    periodEnd: Date,
    amount: MONEY,
    invoiced: { type: Boolean, default: false },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    planName: String,
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    cycle: { type: String, enum: vals(BillingCycle), required: true },
    qty: { type: Number, default: 1 },
    unitAmount: MONEY,
    amount: MONEY,
    currency: { type: String, enum: vals(Currency), default: Currency.USD },
    status: { type: String, enum: vals(SubscriptionStatus), default: SubscriptionStatus.ACTIVE },
    startDate: Date,
    nextBillDate: Date,
    cancelledAt: Date,
    endDate: Date,
    prorationRule: { type: String, enum: vals(ProrationRule), default: ProrationRule.PRORATED },
    cancellationRule: { type: String, enum: vals(ProrationRule), default: ProrationRule.PRORATED },
    schedule: [scheduleEntrySchema],
  },
  opts,
);
subscriptionSchema.index({ number: 1 }, { unique: true });
subscriptionSchema.index({ customerId: 1, status: 1 });
subscriptionSchema.index({ status: 1, nextBillDate: 1 });

const paymentSchema = new Schema(
  {
    amount: MONEY,
    method: { type: String, enum: vals(PaymentMethod), default: PaymentMethod.BANK_TRANSFER },
    reference: String,
    receivedAt: { type: Date, default: Date.now },
    recordedById: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedByName: String,
  },
  { _id: true },
);

const invoiceSchema = new Schema(
  {
    number: { type: String, required: true },
    type: { type: String, enum: vals(InvoiceType), default: InvoiceType.ONE_TIME },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    currency: { type: String, enum: vals(Currency), default: Currency.USD },
    status: { type: String, enum: vals(InvoiceStatus), default: InvoiceStatus.ISSUED },
    lines: [
      {
        _id: false,
        lineId: String,
        productId: { type: Schema.Types.ObjectId, ref: 'Product' },
        description: String,
        qty: Number,
        unitPrice: MONEY,
        discountPct: Number,
        net: MONEY,
        tax: MONEY,
        total: MONEY,
      },
    ],
    subtotal: MONEY,
    taxTotal: MONEY,
    total: MONEY,
    amountPaid: MONEY,
    amountDue: MONEY,
    issueDate: Date,
    dueDate: Date,
    periodStart: Date,
    periodEnd: Date,
    payments: [paymentSchema],
  },
  opts,
);
invoiceSchema.index({ number: 1 }, { unique: true });
invoiceSchema.index({ customerId: 1, status: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ orderId: 1 });

const creditNoteSchema = new Schema(
  {
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: String,
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    amount: MONEY,
    currency: { type: String, enum: vals(Currency), default: Currency.USD },
    reason: String,
    issuedAt: { type: Date, default: Date.now },
  },
  opts,
);
creditNoteSchema.index({ number: 1 }, { unique: true });
creditNoteSchema.index({ customerId: 1, issuedAt: -1 });

/* ------------------------------------------------------------------ deal health */

const dealAlertSchema = new Schema(
  {
    type: { type: String, enum: vals(AlertType), required: true },
    severity: { type: String, enum: vals(AlertSeverity), default: AlertSeverity.MEDIUM },
    status: { type: String, enum: vals(AlertStatus), default: AlertStatus.OPEN },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation' },
    quotationNumber: String,
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: String,
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    ownerName: String,
    entityLabel: String,
    issue: String,
    detail: String,
    flaggedAt: { type: Date, default: Date.now },
    actions: [
      {
        _id: false,
        action: { type: String, enum: ['NUDGE', 'ESCALATE'] },
        actorId: { type: Schema.Types.ObjectId, ref: 'User' },
        actorName: String,
        at: Date,
        note: String,
      },
    ],
  },
  opts,
);
dealAlertSchema.index({ type: 1, status: 1, flaggedAt: -1 });
dealAlertSchema.index({ quotationId: 1, type: 1 }, { unique: true, sparse: true });

/** Monotonic document-number sequences (Q-1042, INV-1042, ...). */
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false } as SchemaOptions);

/* ------------------------------------------------------------------ exports */

/**
 * All models are intentionally untyped at the Mongoose level. The typed contract
 * lives in `@dealflow/shared` and is applied at the serialisation boundary
 * (`toDto`), which keeps the compiler out of Mongoose's very expensive generic
 * inference and keeps `npm run typecheck` fast.
 */
function build(name: string, schema: Schema): Model<any> {
  return model<any>(name, schema);
}

export const User = build('User', userSchema);
export const Customer = build('Customer', customerSchema);
export const Product = build('Product', productSchema);
export const PriceList = build('PriceList', priceListSchema);
export const ProductPairing = build('ProductPairing', productPairingSchema);
export const Warehouse = build('Warehouse', warehouseSchema);
export const Stock = build('Stock', stockSchema);
export const ApprovalChainConfig = build('ApprovalChainConfig', approvalChainConfigSchema);
export const SubscriptionPlan = build('SubscriptionPlan', subscriptionPlanSchema);
export const Quotation = build('Quotation', quotationSchema);
export const Approval = build('Approval', approvalSchema);
export const AuditLog = build('AuditLog', auditLogSchema);
export const PortalToken = build('PortalToken', portalTokenSchema);
export const NegotiationEvent = build('NegotiationEvent', negotiationEventSchema);
export const Notification = build('Notification', notificationSchema);
export const Order = build('Order', orderSchema);
export const Fulfillment = build('Fulfillment', fulfillmentSchema);
export const Subscription = build('Subscription', subscriptionSchema);
export const Invoice = build('Invoice', invoiceSchema);
export const CreditNote = build('CreditNote', creditNoteSchema);
export const DealAlert = build('DealAlert', dealAlertSchema);
export const Counter = build('Counter', counterSchema);

/** Every model, in dependency order. Used by the reset script. */
export const ALL_MODELS = [
  ApprovalChainConfig, User, PriceList, Customer, Product, ProductPairing,
  Warehouse, Stock, SubscriptionPlan, Quotation, Approval, AuditLog,
  PortalToken, NegotiationEvent, Notification, Order, Fulfillment,
  Subscription, Invoice, CreditNote, DealAlert, Counter,
];

/** Build every declared index explicitly. Never rely on lazy autoIndex. */
export async function syncAllIndexes(): Promise<{ model: string; indexes: number }[]> {
  const out: { model: string; indexes: number }[] = [];
  for (const m of ALL_MODELS) {
    await m.createCollection().catch(() => undefined);
    await m.syncIndexes();
    out.push({ model: m.modelName, indexes: (await m.listIndexes()).length });
  }
  return out;
}

/**
 * Next value of a named sequence, starting at `start` on its first call.
 * The raw counter always begins at 0 and increments by exactly 1 per call —
 * `start + seq - 1` is what turns "the 1st call" into `start` and keeps every
 * later call strictly increasing, whatever `start` is. (Clamping a small `seq`
 * up to `start` on every call, as a naive read might suggest, would hand out
 * `start` again on the 2nd call, the 3rd, ... until `seq` finally exceeds it —
 * duplicate numbers for the first `start` calls.)
 */
export async function nextSeq(name: string, start = 1000): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const seq = doc.seq as number;
  return start + seq - 1;
}
