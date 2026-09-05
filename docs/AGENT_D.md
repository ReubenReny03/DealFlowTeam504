# Agent D — Fulfillment, Hybrid Billing, Deal Health & Reporting

> You own **two of the six named pillars** — multi-warehouse fulfillment and
> hybrid billing — plus deal health and reporting. Eight of the eighteen screens
> are yours. Start early; you have the widest surface.

## Mission

The warehouse split with reservations, manual override and backorder
consolidation; subscription schedules with proration, cancellation and credit
notes; invoices reconciled to shipped quantity; payment recording with the order
stepper; deal-health rule evaluation with nudge and escalate; and the reporting
dashboard with its four filters.

## Your slice of the user journey

**`USER_FLOWS.md` §C steps 19–22** — the order splits itself across two
warehouses with its reasoning shown, one order produces two billing artefacts,
finance records the payment, and the manager catches a stalling deal.
**§D "K. Iyer"** (fulfillment and billing) — including cancelling a subscription
mid-cycle and seeing the credit note.
**§E4** backorder · **§E5** the consolidation prompt · **§E6** manual override ·
**§E7** delivery slippage · **§E8** the escalated anomaly.

**Where you hand off:**

- ← **Agent C** at §C step 18: `POST /portal/q/:number/confirm` calls your
  `createOrderFromQuotation()`. **Agree the signature with C at T+8.**
  **Do not wait for it** — ORD-1041, ORD-1032 and ORD-1036 are already seeded,
  so split, billing and payment are all buildable and demoable today.
- → nobody. You are the end of the chain, which means **you must not be the
  reason the demo stops at "approved".**

## Why this matters to the demo

Judging moments **#3** (the split shows its rationale, and override works) and
**#4** (one order → two billing artefacts) are yours outright. The last ninety
seconds of the script — 3:40 to 5:00 — is almost entirely your work.

---

## Files you own (exclusive)

```
apps/api/src/modules/fulfillment/**
apps/api/src/modules/stock/**
apps/api/src/modules/orders/**
apps/api/src/modules/billing/**
apps/api/src/modules/subscriptions/**
apps/api/src/modules/invoices/**
apps/api/src/modules/payments/**
apps/api/src/modules/dealHealth/**
apps/api/src/modules/reporting/**
apps/api/src/seed/modules/fulfillment.seed.ts
apps/api/src/seed/modules/billing.seed.ts
apps/api/src/seed/modules/alerts.seed.ts
apps/api/src/seed/modules/history.seed.ts
apps/web/src/app/features/{fulfillment,subscriptions,billing,invoices,dealHealth,reports}/**
apps/web/src/app/core/state/feature.stores.ts   (FulfillmentStore, BillingStore,
                                                 DealHealthStore, ReportingStore)
```

## Files you may append to (one line only)

- `apps/api/src/routes.registry.ts`
- `apps/api/src/seed/seeds.registry.ts`
- `apps/web/src/app/app.routes.ts` — your `/app/*` entries
- `apps/web/src/app/core/api/mock.data.ts`

## Files you must never touch

`packages/shared/**` (ask Agent A) · `app.ts` · `core/`, `shared/`, `layouts/` ·
`portal/` · anything owned by A, B or C

---

## Contracts you consume

| From | What |
|---|---|
| `@dealflow/shared` | `planWarehouseSplit`, `checkBackorderConsolidation`, `prorate`, `prorateFromDates`, `cancellationSettlement`, `nextBillingDates`, `buildBillingSchedule`, `invoiceableOneTimeLines`, `evaluateDealHealth` + the three detectors, `averageDiscountPct`, and every fulfillment/billing/alert DTO |
| Agent A | `requireAuth(roles)`, `writeAudit()`, `withTransaction()`, the UI kit, `InternalShell`, the seeded warehouses and stock |
| Agent B | `QuotationDto.lines` — the shape order lines are built from |
| **Agent C** | **`POST /portal/q/:number/confirm` triggers your order creation** |

## Contracts you produce

| What | Consumed by |
|---|---|
| `createOrderFromQuotation(quotationId, actor)` | **Agent C's confirm endpoint** |
| `FulfillmentDto` with a non-empty `rationale` | screens 7, 8 |
| `SubscriptionDto` with a generated `schedule` | screens 9, 10 |
| `InvoiceDto` split by `type: ONE_TIME | RECURRING` | screens 12, 13 |
| `DealHealthDashboardDto` | screen 14 |
| `ReportingDashboardDto` | screen 15 |
| the fulfillment, billing, alerts and history seeds | **everyone** — screens 7–15 |

## Your features from `FEATURE_PRIORITY.md`

**P0:** #15 warehouse split + reservation + rationale · #16 hybrid billing ·
#17 record payment + stepper · #18 deal health tiles
**P1:** #24 manual override · #25 backorder + consolidation · #26 proration and
credit notes · #28 reporting filters · #30 nudge/escalate · #31 delivery slippage
**P2:** #33 CSV/PDF/XLS export · #37 SLA breach highlighting

---

## Tasks

### T+0 → T+2 — read and plan

| # | Task | Done when |
|---|---|---|
| D-1 | Read `USER_FLOWS` §C 19–22, §D K. Iyer, §E4–E8; `BUSINESS_RULES` §3, §4, §6 | you can explain why Main gets 18 and East gets 6 |
| D-2 | Agree `createOrderFromQuotation` with Agent C | both of you have written it down |

### T+2 → T+8 — the seed and the read side *(do not wait for C)*

| # | Task | Done when |
|---|---|---|
| D-3 | `fulfillment.seed.ts` — 3 orders, 3 fulfillments, **allocations produced by the real planner**, reservations written back | reset assertion 5 passes: Main 18 / East 6 |
| D-4 | `billing.seed.ts` — 21 subscriptions (16/2/3), INV-1042 unpaid, INV-1043 recurring paid, INV-1039 paid | reset assertion 6 passes; screens 9, 10, 12, 13 are non-empty |
| D-5 | `history.seed.ts` — ~136 historical quotations, 12 completed approvals with real cycle times, 2 deliberately idle quotes, 1 extra anomaly | screen 15's KPIs are real; Stalled reads 5 and Anomalies 2 |
| D-6 | `alerts.seed.ts` — alerts produced by the **real** rule functions | reset assertion 7 passes; Q-1030 reads "idle 9 days" |
| D-7 | The read endpoints and screens 7, 9, 12, 14, 15 | every one renders real data |

### T+8 → T+13 — fulfillment

| # | Task | Done when |
|---|---|---|
| D-8 | `createOrderFromQuotation()` — snapshot lines, `qtyShipped`/`qtyInvoiced` at 0 | Agent C can call it |
| D-9 | **`POST /fulfillment/plan/:orderId`** — run `planWarehouseSplit` against live stock and persist | smoke step 5 passes; `rationale` is non-empty |
| D-10 | **`POST /fulfillment/:id/accept`** — reserve **atomically** inside a transaction | availability drops on screen 7 the moment it is accepted |
| D-11 | **`POST /fulfillment/:id/override`** — validate against live availability, reserve, audit-log with a reason | asking for more than exists returns `409 INSUFFICIENT_STOCK` |
| D-12 | Screen 8 — the split table, the backorder table, and **the rationale panel** | the reasoning is on screen, not in a log |
| D-13 | `POST /stock/adjust` — and it must flip a covered backorder to `CONSOLIDATION_AVAILABLE` | restocking East Depot raises the banner on screen 8 |
| D-14 | `POST /fulfillment/:id/ship` | `qtyShipped` moves, which is what unlocks invoicing |

### T+13 → T+18 — billing

| # | Task | Done when |
|---|---|---|
| D-15 | On confirm: one-time lines → an `Invoice`, recurring lines → a `Subscription` with a schedule | **no product appears on both** |
| D-16 | `POST /invoices/generate/:orderId` — bill `min(qtyShipped, qty) − qtyInvoiced` | ship 18 of 24 → an invoice for 18; ship the rest → an invoice for 6; never 24 twice |
| D-17 | **`POST /invoices/:id/payments`** — advance the invoice and the order stepper | smoke step 9 passes; the stepper reaches **Paid** |
| D-18 | `POST /subscriptions/:id/modify` — prorate, net onto the next invoice or a credit note | the response's `explanation` reads in plain English |
| D-19 | `POST /subscriptions/:id/cancel` — settle under the cancellation rule | PRORATED issues a credit note for the unused days |
| D-20 | Screens 10 and 13 — one-time and recurring side by side, the stepper, related invoices | judging moment #4 is visible in one screenshot |

### T+18 → T+21 — deal health, reporting, polish

| # | Task | Done when |
|---|---|---|
| D-21 | `POST /deal-health/evaluate` — re-run the rules and upsert one alert per (quotation, type) | re-running does not duplicate |
| D-22 | `POST /deal-health/:id/{nudge,escalate}` — notify, activity, audit | smoke step 10; the row's action column updates |
| D-23 | Reporting with all four filters | smoke step 11; changing a filter changes the numbers |
| D-24 | CSV export, then PDF/XLS if there is time | P2 — only after P0/P1 are green |
| D-25 | Empty, loading and error states on all eight of your screens | none can render blank |
| D-26 | Take a turn as rotating integrator | see `AGENT_E_INTEGRATION.md` |

---

## Definition of done, per task

- `npm run verify` green
- your smoke steps (5, 6, 9, 10, 11) pass
- **the stock invariant holds everywhere:** `available === max(0, inStock − reserved)`
- **no invoice ever bills more than was shipped**
- every allocation, override, payment and alert action writes an `AuditLog`
- `rationale` is never empty on a fulfillment

## Acceptance tests you must make pass

1. `npm run reset` assertion 5 — Laptop Pro 14: Main **18** available, East **6**,
   and the invariant holds
2. `npm run reset` assertion 6 — INV-1042 unpaid, INV-1043 recurring and paid,
   same order, **no shared product**, total equals the sum of lines
3. `npm run reset` assertion 7 — at least one stalled deal and one anomaly;
   Q-1030 reads "idle 9 days"
4. `npm run reset` assertions 11–13 — stock conservation, integer money, invoice
   totals
5. `npm run smoke` step 5 — the split is planned with a non-empty rationale
6. `npm run smoke` step 6 — one order → two artefacts, 16 active subscriptions,
   the Care Plan carries a generated schedule and a next bill date
7. `npm run smoke` step 9 — a payment moves the invoice to PAID and the stepper on
8. `npm run smoke` steps 10, 11 — deal health and reporting
9. **By hand:** confirm an order for 24 laptops → **Main 18 + East 6, $42 + $26,
   2 shipments**, and the rationale names both warehouses
10. **By hand:** restock East Depot → the consolidation banner appears without a
    reload trigger

## Seed data you own

| File | What |
|---|---|
| `fulfillment.seed.ts` | ORD-1041 (Acme, shipped) · **ORD-1032 (Zenith, backorder)** · ORD-1036 (Novus, paid). Allocations come from the **real planner**, and reservations are written back to stock. |
| `billing.seed.ts` | 21 subscriptions — **16 Active / 2 Paused / 3 Cancelled** · **INV-1042** one-time unpaid · **INV-1043** recurring paid · **INV-1039** paid |
| `alerts.seed.ts` | Alerts computed by the **real** rule functions: 5 stalled, 2 anomalies, 1 slippage. Q-1030 is already nudged, Delta LLC already escalated. |
| `history.seed.ts` | ~136 historical quotations + 12 completed approvals with real cycle times, so "quotes created" and "avg approval time" are counts, not constants |

**Never hardcode an allocation or a KPI.** Run the planner and the detectors in
the seed, exactly as the app does.

## Known risks and mitigations

| Risk | Mitigation |
|---|---|
| **Agent C's confirm is late and you have nothing to fulfil** | ORD-1041, ORD-1032 and ORD-1036 are already seeded. Build and demo everything against them. **Do not sit idle waiting.** |
| The split does not produce 18 + 6 | It depends on Main having 18 available and East 6. If the numbers moved, someone changed the stock seed — assertion 5 will say so. |
| Reservations drift from allocations | The stock invariant is asserted on every reset. Reserve inside `withTransaction()`; release on cancellation. |
| An invoice double-bills | `invoiceableOneTimeLines` subtracts `qtyInvoiced`. Always persist `qtyInvoiced` after issuing. Tested. |
| A recurring line lands on the one-time invoice | Filter on `isSubscription`. Asserted by reset assertion 6 and smoke step 6. |
| Deal-health alerts duplicate on re-evaluation | The `{quotationId, type}` unique index. Upsert, never insert. |
| You have the widest surface and run out of time | Your P0 rows are #15–#18. Everything else is P1. Follow `FEATURE_PRIORITY.md` top-down and stop where you are. |

---

## Prompt block for your AI agent

```
You are Agent D on DealFlow360, a 4-person 24-hour hackathon build.
Repo: <path>. Stack: Node/Express/TypeScript + MongoDB/Mongoose + Angular 17
standalone/signals + npm workspaces.

READ FIRST: docs/MASTER_SPEC.md · docs/USER_FLOWS.md (§C steps 19-22, §D K. Iyer,
§E4-E8) · docs/AGENT_D.md (your brief) · docs/BUSINESS_RULES.md §3, §4, §6 ·
docs/UI_SPEC.md screens 7, 8, 9, 10, 12, 13, 14, 15.

YOU OWN TWO OF THE SIX NAMED PILLARS (multi-warehouse fulfillment and hybrid
billing) and EIGHT of the eighteen screens. Widest surface on the team. Start
early.

YOU OWN (exclusively): apps/api/src/modules/{fulfillment,stock,orders,billing,
subscriptions,invoices,payments,dealHealth,reporting}/**,
apps/api/src/seed/modules/{fulfillment,billing,alerts,history}.seed.ts,
apps/web/src/app/features/{fulfillment,subscriptions,billing,invoices,dealHealth,
reports}/**, and the FulfillmentStore / BillingStore / DealHealthStore /
ReportingStore classes in core/state/feature.stores.ts

NEVER TOUCH: packages/shared/** (ask Agent A), apps/api/src/app.ts,
apps/web/src/app/{core,shared,layouts,portal}/**, anything owned by A, B or C.

APPEND ONE LINE ONLY to: routes.registry.ts, seeds.registry.ts, app.routes.ts,
core/api/mock.data.ts.

NON-NEGOTIABLE:
- NEVER reimplement a rule. Import planWarehouseSplit, checkBackorderConsolidation,
  prorate, cancellationSettlement, buildBillingSchedule, invoiceableOneTimeLines
  and the deal-health detectors from @dealflow/shared.
- FulfillmentDto.rationale is NEVER empty. It is the plain-English proof that the
  split is reasoned, and it is shown on screen 8. It is judging moment #3.
- Stock invariant, everywhere: available === max(0, inStock - reserved).
  Reserve atomically inside withTransaction(). Release on cancellation.
- NOTHING IS BILLED BEFORE IT SHIPS: bill min(qtyShipped, qty) - qtyInvoiced.
  Persist qtyInvoiced after issuing so a re-run never double-bills.
- ONE ORDER PRODUCES TWO ARTEFACTS: a one-time Invoice AND a Subscription with
  its own schedule. NO product may appear on both. That is judging moment #4.
- Recurring lines are invoiced at the BEGINNING of each period
  (dueDate === periodStart).
- Money is an integer count of cents.
- Deal-health anomalies compare against the OWNING REP's own trailing average,
  not a global one.
- Every allocation, override, payment and alert action writes an AuditLog.
- Angular: `@else if (x; as y)` is NOT supported. Use
  `@else { @if (x; as y) { ... } }`.
- DO NOT WAIT FOR AGENT C. ORD-1041, ORD-1032 and ORD-1036 are already seeded.
  Build and demo split, billing, payment and deal health against them, and wire
  C's confirm call when it lands.

WORK IN THIS ORDER (docs/AGENT_D.md has the full table):
  T+8  D-3..D-7   the four seeds + read endpoints + screens 7, 9, 12, 14, 15
  T+13 D-8..D-14  order creation, the split, accept, override, consolidation
  T+18 D-15..D-20 hybrid billing, invoicing, payments, proration, screens 10/13
  T+21 D-21..D-26 deal health actions, reporting filters, export, states

DEFINITION OF DONE: `npm run verify` green, and smoke steps 5, 6, 9, 10 and 11
pass.

Start with D-3. Show me the plan first.
```
