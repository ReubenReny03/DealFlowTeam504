# Data Model Walkthrough — how to explain it to a proctor

This is the narrative companion to [`DATA_MODEL.md`](./DATA_MODEL.md) (the full technical reference). Read this one when you need to *talk through* the schema out loud, not look up a field name.

## The one-sentence mental model

Everything in this schema exists to answer one question at each stage: **"is this deal safe to let through, and who's responsible for it right now?"** Every collection is a snapshot of that chain: `Customer → Quotation → Approval → Order → Fulfillment → Invoice`.

There are **22 top-level MongoDB collections**. Some data lives *inside* a parent document instead of its own collection (MongoDB lets you nest) — those are flagged below, because that distinction is itself worth telling a proctor: it shows deliberate modeling, not just "one table per noun."

---

## Cluster 1 — Identity & Catalog (the nouns everything else references)

| Collection | Purpose | Points to |
|---|---|---|
| **User** | Reps, managers, finance, admin — `role` field drives permissions | — |
| **Customer** | A company you sell to; has a tier (Bronze/Silver/Gold/Platinum) | `ownerId → User` (their rep), `priceListId → PriceList` |
| **Product** | Catalog item (embeds `Variant` — size/color — no separate collection) | — |
| **PriceList** | One per tier; a table of product → price overrides | `entries[].productId → Product` |
| **ProductPairing** | "Customers who bought X also bought Y" upsell pairs | `productId`, `suggestedProductId → Product` |
| **Warehouse** | A physical fulfillment location | — |
| **Stock** | How much of one product sits in one warehouse | `warehouseId → Warehouse`, `productId → Product` |

**Talking point:** *"Customer and Product are the anchors — almost every other collection eventually traces back to one or both of these."*

---

## Cluster 2 — The Sales Core (this is the heart of the demo)

| Collection | Purpose | Points to |
|---|---|---|
| **Quotation** | A draft/submitted deal. Embeds its own `lines[]`, `risk{}`, `totals{}` — no separate collections for those | `customerId`, `priceListId`, `ownerId → User`, `approvalId → Approval`, `orderId → Order` |
| **Approval** | The human decision trail on a HIGH/MEDIUM risk quote. Embeds `steps[]` and `trail[]` | `quotationId → Quotation`, `customerId`, `ownerId` |
| **ApprovalChainConfig** | The *rules* (not a per-quote record) — "HIGH risk → Sales Manager then Finance" | — (config singleton, read by the risk engine) |
| **PortalToken** | A scoped link that lets a customer view/negotiate one quote without logging in | `quotationId`, `customerId`, `userId` |
| **NegotiationEvent** | One message/counter-offer in the back-and-forth with a customer | `quotationId`, `authorId → User` |
| **DealAlert** | A system-raised flag — stalled deal, discount anomaly, delivery slipping | `quotationId`, `orderId`, `customerId`, `ownerId` |

**Talking point:** *"A Quotation is a document, not a row spread across five tables — its lines, its risk score, its totals are embedded because they're always read and written together. That's a MongoDB modeling choice, not a limitation."*

This is where the **risk engine** plugs in: `Quotation.risk` is the *output* of `calculateBlendedRisk()`, and if it's HIGH, an `Approval` document gets created and the chain from `ApprovalChainConfig` decides who needs to sign off.

---

## Cluster 3 — Fulfillment (after a quote is won)

| Collection | Purpose | Points to |
|---|---|---|
| **Order** | A confirmed Quotation. Embeds `lines[]` | `quotationId`, `customerId`, `ownerId` |
| **Fulfillment** | One warehouse's shipment for part of an order. Embeds `allocations[]` | `orderId`, `customerId` |

**Talking point:** *"One Order can produce multiple Fulfillments — that's the warehouse-splitting logic. If Main warehouse only has 22 units of something and the order needs 40, the planner creates two Fulfillment records, one per warehouse, and the leftover becomes a backorder with an ETA."*

---

## Cluster 4 — Billing (money after delivery)

| Collection | Purpose | Points to |
|---|---|---|
| **SubscriptionPlan** | A recurring billing template (e.g. "monthly support") | `productId` |
| **Subscription** | A customer's actual recurring commitment. Embeds `schedule[]` | `customerId`, `orderId`, `planId`, `productId` |
| **Invoice** | A bill — one-time or recurring. Embeds `lines[]` **and** `payments[]` | `customerId`, `orderId`, `subscriptionId` |
| **CreditNote** | A refund/adjustment against an invoice | `customerId`, `subscriptionId`, `invoiceId` |

**Talking point:** *"Payment isn't its own collection — it's embedded inside Invoice, because a payment only ever makes sense in the context of the invoice it's paying down. This is DealFlow's 'hybrid billing': one-time invoices for the initial order, recurring invoices generated on a schedule for subscriptions, both using the same Invoice shape."*

---

## Cluster 5 — Cross-cutting / system

| Collection | Purpose |
|---|---|
| **AuditLog** | Immutable record of who did what, when — `actorId → User` |
| **Notification** | In-app alerts for a user — `userId → User` |
| **Counter** | Just an atomic sequence generator (for human-readable IDs like `Q-1042`, `ORD-1041`) — not business data |

---

## The story arc — how to actually narrate this to your proctor

Don't recite the tables above. Walk the *lifecycle*, and mention a collection only when it enters the story:

1. **A rep builds a quote for a Customer.** → creates a `Quotation`, priced against that customer's `PriceList`, checked against `Stock` for availability.
2. **The risk engine scores it live.** → `Quotation.risk` computed by the shared risk logic on every edit.
3. **If it's risky, it needs sign-off.** → an `Approval` is created, routed per `ApprovalChainConfig`.
4. **Customer negotiates through a private link.** → `PortalToken` scopes their access; each back-and-forth is a `NegotiationEvent`.
5. **Once confirmed, it becomes an Order.** → `Quotation → Order`, and inventory across `Warehouse`/`Stock` decides how many `Fulfillment`s are needed.
6. **Delivery triggers billing.** → one-time `Invoice`, or a `Subscription` that spins off recurring `Invoice`s on its `schedule[]`.
7. **Everything is watched.** → `DealAlert` flags stalled deals or discount anomalies; `AuditLog` proves who did what, for accountability.

That's the sentence that ties all 22 collections together: **every document is a snapshot of one deal moving through exactly that pipeline, and the risk score decides how much human friction it hits along the way.**
