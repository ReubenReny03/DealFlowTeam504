/**
 * Display constants shared by the API (console output, exports) and the UI.
 * Every label here is taken verbatim from the mockup so screens, docs and seed
 * output can never drift apart.
 */
import {
  AlertType,
  ApprovalStatus,
  BillingCycle,
  CustomerTier,
  FulfillmentStatus,
  InvoiceStatus,
  ProductCategory,
  QuoteStage,
  RiskLevel,
  Role,
  SubscriptionStatus,
} from './enums/index.js';

export const APP_NAME = 'DealFlow360';
export const APP_TAGLINE = 'An intelligent, self-governing sales operations platform';

/**
 * The service-level target for how long a quotation should sit in the approval
 * chain before a human decides it. Drives the "Avg Approval Time" highlight on
 * the reporting dashboard and the "over SLA" flag on the approval queue.
 */
export const APPROVAL_SLA_HOURS = 24;

/**
 * The quotation stages Finance may see on screen 3.
 *
 * Finance works the second half of a deal — margin on what cleared approval, and
 * the billing that follows — so drafts, quotes still awaiting a Sales Manager and
 * rejected ones are not their queue. CONFIRMED stays in on purpose: a deal the
 * customer accepted is exactly what an invoice is raised against.
 *
 * The API enforces this (see `utils/roleScope.ts`); the constant is shared so the
 * UI describes the same rule it is being served.
 */
export const FINANCE_QUOTATION_STAGES: QuoteStage[] = [
  QuoteStage.APPROVED,
  QuoteStage.NEGOTIATION,
  QuoteStage.CONFIRMED,
];

export const STAGE_LABEL: Record<QuoteStage, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  NEGOTIATION: 'Negotiation',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  SALES_REP: 'Sales Rep',
  SALES_MANAGER: 'Sales Manager',
  FINANCE: 'Finance',
  CUSTOMER: 'Customer',
};

export const TIER_LABEL: Record<CustomerTier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
};

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  HARDWARE: 'Hardware',
  SERVICES: 'Services',
  SUBSCRIPTION: 'Subscription',
};

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  CANCELLED: 'Cancelled',
};

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  PENDING: 'Pending',
  SPLIT_PENDING: 'Split Pending',
  RESERVED: 'Reserved',
  PARTIALLY_SHIPPED: 'Partially Shipped',
  SHIPPED: 'Shipped',
  BACKORDER: 'Backorder',
  CONSOLIDATION_AVAILABLE: 'Consolidation Available',
  CANCELLED: 'Cancelled',
};

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  NOT_REQUIRED: 'Auto-Approved',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  RETURNED: 'Returned',
  REJECTED: 'Rejected',
};

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  STALLED_DEAL: 'Stalled Deals',
  DISCOUNT_ANOMALY: 'Discount Anomalies',
  DELIVERY_SLIPPAGE: 'Delivery Slippage',
};

/** Tailwind class fragments. One place, so every status chip in the app matches. */
export const STATUS_COLORS = {
  stage: {
    DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-800 border-amber-200',
    APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    NEGOTIATION: 'bg-sky-100 text-sky-800 border-sky-200',
    CONFIRMED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  } as Record<QuoteStage, string>,
  risk: {
    NONE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    LOW: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200',
    HIGH: 'bg-rose-100 text-rose-800 border-rose-200',
  } as Record<RiskLevel, string>,
  tier: {
    BRONZE: 'bg-orange-100 text-orange-800 border-orange-200',
    SILVER: 'bg-slate-100 text-slate-700 border-slate-300',
    GOLD: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  } as Record<CustomerTier, string>,
  invoice: {
    DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
    ISSUED: 'bg-rose-100 text-rose-800 border-rose-200',
    PARTIALLY_PAID: 'bg-amber-100 text-amber-800 border-amber-200',
    PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    OVERDUE: 'bg-rose-200 text-rose-900 border-rose-300',
    VOID: 'bg-slate-100 text-slate-500 border-slate-200',
  } as Record<InvoiceStatus, string>,
} as const;

/** Internal top navigation, in the mockup's order. */
export const INTERNAL_NAV: { label: string; route: string; roles: Role[]; screen: number }[] = [
  {
    label: 'Dashboard',
    route: '/app/dashboard',
    roles: [Role.ADMIN, Role.SALES_REP, Role.SALES_MANAGER, Role.FINANCE],
    screen: 2,
  },
  {
    label: 'Quotations',
    route: '/app/quotations',
    roles: [Role.ADMIN, Role.SALES_REP, Role.SALES_MANAGER, Role.FINANCE],
    screen: 3,
  },
  {
    label: 'Approvals',
    route: '/app/approvals',
    roles: [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE],
    screen: 5,
  },
  {
    label: 'Fulfillment',
    route: '/app/fulfillment',
    roles: [Role.ADMIN, Role.SALES_REP, Role.SALES_MANAGER, Role.FINANCE],
    screen: 7,
  },
  {
    label: 'Subscriptions',
    route: '/app/subscriptions',
    roles: [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE],
    screen: 9,
  },
  {
    label: 'Invoices',
    route: '/app/invoices',
    roles: [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE],
    screen: 12,
  },
  {
    label: 'Deal Health',
    route: '/app/deal-health',
    roles: [Role.ADMIN, Role.SALES_REP, Role.SALES_MANAGER],
    screen: 14,
  },
  {
    label: 'Reports',
    route: '/app/reports',
    roles: [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE],
    screen: 15,
  },
  {
    label: 'Products',
    route: '/admin/products',
    roles: [Role.ADMIN, Role.SALES_MANAGER],
    screen: 16,
  },
];

/** Portal navigation — deliberately tiny. The customer sees three things. */
export const PORTAL_NAV: { label: string; route: string }[] = [
  { label: 'My Quotation', route: 'quotation' },
  { label: 'Messages', route: 'messages' },
  { label: 'Profile', route: 'profile' },
];

/** Where each role lands immediately after login. */
export const LANDING_ROUTE: Record<Role, string> = {
  ADMIN: '/admin/products',
  SALES_REP: '/app/dashboard',
  SALES_MANAGER: '/app/dashboard',
  FINANCE: '/app/approvals',
  CUSTOMER: '/portal',
};

/** Empty-state copy, one per screen. Referenced verbatim by docs/USER_FLOWS.md §B. */
export const EMPTY_STATES: Record<string, { title: string; body: string; cta?: string }> = {
  quotations: {
    title: 'No quotations yet',
    body: 'Quotations you create will appear here, grouped by stage. Start one to see live pricing, margin and risk as you build.',
    cta: '+ New Quotation',
  },
  approvals: {
    title: 'Nothing waiting on you',
    body: 'Quotations only land here when their blended risk score requires a human. An empty queue means every open deal is inside its discount limits.',
  },
  fulfillment: {
    title: 'No orders awaiting fulfillment',
    body: 'Confirmed orders appear here with a suggested warehouse split. Confirm a quotation to see one.',
  },
  subscriptions: {
    title: 'No subscriptions yet',
    body: 'Recurring lines on a confirmed order create a subscription with its own billing schedule, separate from the one-time invoice.',
  },
  invoices: {
    title: 'No invoices yet',
    body: 'Invoices are raised against shipped quantities, so nothing is billed before it ships.',
  },
  dealHealth: {
    title: 'Every deal looks healthy',
    body: 'No stalled quotes, no discount anomalies and no delivery slippage against the current thresholds.',
  },
  products: {
    title: 'No products configured',
    body: 'A sales rep cannot build a quotation until the catalogue has at least one active product with a price and a tax rate.',
    cta: '+ New Product',
  },
  pricelists: {
    title: 'No price lists configured',
    body: "A customer's tier resolves what they pay through its price list. Until one exists, every line prices at the catalogue's base price.",
  },
  warehouses: {
    title: 'No warehouses configured',
    body: 'An order cannot be split or reserved until at least one warehouse exists with a shipping cost weight and a lead time.',
    cta: '+ New Warehouse',
  },
  plans: {
    title: 'No subscription plans yet',
    body: 'A recurring line needs a plan before it can generate a billing schedule with its own proration and cancellation rules.',
    cta: '+ New Plan',
  },
  config: {
    title: 'Discount governance is not configured',
    body: 'Set the tier and category discount ceilings before any quotation can be risk-scored. Until then every quote routes to a Sales Manager by default.',
    cta: 'Save configuration',
  },
  portal: {
    title: 'Nothing to review right now',
    body: 'When your account manager sends a quotation for review it will appear here, and you can comment on any line or counter the discount.',
  },
  audit: {
    title: 'No activity recorded yet',
    body: 'Every approval, rejection, edit, discount change and negotiation event is logged here with who did it, when, and why.',
  },
};

/**
 * Shown when a SEARCH returns nothing — never the same words as an empty
 * collection. "You have no invoices" and "nothing matches 'acme'" are different
 * facts, and telling a user the first when the second is true sends them
 * looking for a bug that is not there.
 */
export const NO_MATCHES = {
  title: 'No matches',
  body: 'Nothing here matches that search. Try a different term, or clear the search to see everything again.',
  cta: 'Clear search',
};

/** The 18 screens, so docs, routing and the screen-to-journey map cannot drift. */
export const SCREEN_REGISTRY: {
  id: number;
  name: string;
  route: string;
  personas: Role[];
  owner: 'A' | 'B' | 'C' | 'D';
}[] = [
  {
    id: 1,
    name: 'Login / Signup',
    route: '/login',
    personas: [Role.ADMIN, Role.SALES_REP, Role.SALES_MANAGER, Role.FINANCE, Role.CUSTOMER],
    owner: 'A',
  },
  {
    id: 2,
    name: 'Sales Dashboard',
    route: '/app/dashboard',
    personas: [Role.SALES_REP, Role.SALES_MANAGER, Role.ADMIN],
    owner: 'B',
  },
  {
    id: 3,
    name: 'Quotations (List)',
    route: '/app/quotations',
    personas: [Role.SALES_REP, Role.SALES_MANAGER, Role.ADMIN],
    owner: 'B',
  },
  {
    id: 4,
    name: 'Quotation Detail',
    route: '/app/quotations/:id',
    personas: [Role.SALES_REP, Role.SALES_MANAGER],
    owner: 'B',
  },
  {
    id: 5,
    name: 'Approvals (List)',
    route: '/app/approvals',
    personas: [Role.SALES_MANAGER, Role.FINANCE, Role.ADMIN],
    owner: 'C',
  },
  {
    id: 6,
    name: 'Approval Detail',
    route: '/app/approvals/:id',
    personas: [Role.SALES_MANAGER, Role.FINANCE],
    owner: 'C',
  },
  {
    id: 7,
    name: 'Fulfillment and Stock',
    route: '/app/fulfillment',
    personas: [Role.FINANCE, Role.SALES_MANAGER, Role.ADMIN],
    owner: 'D',
  },
  {
    id: 8,
    name: 'Fulfillment Detail',
    route: '/app/fulfillment/:id',
    personas: [Role.FINANCE, Role.SALES_MANAGER],
    owner: 'D',
  },
  {
    id: 9,
    name: 'Subscriptions (List)',
    route: '/app/subscriptions',
    personas: [Role.FINANCE, Role.SALES_MANAGER, Role.ADMIN],
    owner: 'D',
  },
  {
    id: 10,
    name: 'Billing Detail',
    route: '/app/subscriptions/:id',
    personas: [Role.FINANCE, Role.SALES_MANAGER],
    owner: 'D',
  },
  {
    id: 11,
    name: 'Customer Portal Negotiation',
    route: '/portal/q/:number',
    personas: [Role.CUSTOMER],
    owner: 'C',
  },
  {
    id: 12,
    name: 'Invoices (List)',
    route: '/app/invoices',
    personas: [Role.FINANCE, Role.SALES_MANAGER, Role.ADMIN],
    owner: 'D',
  },
  {
    id: 13,
    name: 'Invoice Detail',
    route: '/app/invoices/:id',
    personas: [Role.FINANCE, Role.SALES_MANAGER],
    owner: 'D',
  },
  {
    id: 14,
    name: 'Deal Health & Anomaly Dashboard',
    route: '/app/deal-health',
    personas: [Role.SALES_MANAGER, Role.SALES_REP, Role.ADMIN],
    owner: 'D',
  },
  {
    id: 15,
    name: 'Admin / Reporting Dashboard',
    route: '/app/reports',
    personas: [Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE],
    owner: 'D',
  },
  {
    id: 16,
    name: 'Product Dashboard',
    route: '/admin/products',
    personas: [Role.ADMIN, Role.SALES_MANAGER],
    owner: 'A',
  },
  {
    id: 17,
    name: 'Product Details',
    route: '/admin/products/:id',
    personas: [Role.ADMIN],
    owner: 'A',
  },
  {
    id: 18,
    name: 'Discount Tiers & Approval Chain Setup',
    route: '/admin/config',
    personas: [Role.ADMIN, Role.SALES_MANAGER],
    owner: 'A',
  },
];
