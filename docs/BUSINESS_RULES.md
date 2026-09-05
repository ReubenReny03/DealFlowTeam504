# Business rules

Every rule in DealFlow360, with worked numbers and the test that proves it.

All of these live as **pure functions** in `packages/shared/src/logic/`. They
take data in and give data back — no clock, no database, no randomness. The API
calls them when it saves; the Angular builder calls the same ones on every
keystroke. That is why the live preview on screen 4 can never disagree with what
the server stores.

Tests: `packages/shared/test/` — 99 of them, run with `npm run test`.

---

## 1. The blended discount risk score

**File:** `packages/shared/src/logic/risk.ts` · **Tests:** `test/risk.test.ts`

This is the single most judge-visible piece of logic in the product, and the only
place allowed to decide whether a quotation needs a human.

### The rule

For each line *i*:

```
allowedPct_i  = min(tierCeiling, categoryCeiling)     <- the stricter always wins
overBy_i      = max(0, discountPct_i - allowedPct_i)   (percentage POINTS)
lineGross_i   = unitPrice_i x qty_i                    (pre-discount, the weight)
```

Then:

```
blendedOverPct = SUM(lineGross_i x overBy_i) / SUM(lineGross_i)
maxSingleOver  = MAX(overBy_i)
riskScore      = min(100, round(blendedOverPct x 7 + maxSingleOver x 3))
```

### Why two terms

Neither alone is sufficient, and that is what "blended" means.

- **`blendedOverPct`** catches *death by a thousand cuts*: many lines each a
  little over, none alarming alone. A rep can keep every line technically
  defensible and still give away far more margin than the company intends.
- **`maxSingleOver`** catches one badly-broken line that a large clean line would
  otherwise dilute to nothing.

### Routing

All thresholds live in `ApprovalChainConfig` and are editable on screen 18.

| Score | Level | Chain |
|---|---|---|
| `0` | `NONE` (displayed "LOW") | *nobody* — auto-approved, no human step |
| `1 … 29` | `MEDIUM` | `[SALES_MANAGER]` |
| `>= 30` | `HIGH` | `[SALES_MANAGER, FINANCE]` |

**Hard escalation override:** any single line `>= 8` points over its own limit
forces `HIGH` regardless of the score.

### Worked example — Q-1042, the demo quote

A Gold customer. Gold is allowed 15%; Hardware is allowed 15%; Services only 10%.

| Line | Category | Given | Tier ceiling | Category ceiling | **Allowed** | Over by | Gross |
|---|---|---|---|---|---|---|---|
| Laptop Pro 14 ×2 @ $1,200 | Hardware | 12% | 15 | 15 | **15** | **0** | $2,400 |
| Onsite Setup Service ×1 @ $450 | Services | 18% | 15 | 10 | **10** | **8** | $450 |

```
blendedOverPct = (2400 x 0 + 450 x 8) / (2400 + 450)
               = 3600 / 2850
               = 1.2631...

maxSingleOver  = 8

riskScore      = round(1.2631 x 7 + 8 x 3)
               = round(8.842 + 24)
               = round(32.842)
               = 33                       -> HIGH -> [SALES_MANAGER, FINANCE]
```

Even though the customer is Gold and 15% sounds fine on paper, the *Service* line
broke its own stricter limit. One bad line is enough.

> **Test:** `risk.test.ts` › "the PDF worked example (Q-1042)" — eight assertions
> pinning the ceilings, the overage, the blended average, `maxSingleOver`, the
> score of 33, the chain, and the explanation payload.
> **Also asserted by** `npm run reset` (post-seed assertion 3) and
> `npm run smoke` (step 2).

### Worked example — death by a thousand cuts

Three Hardware lines for a Gold customer (ceiling 15%), equal gross of $1,000
each, at 17%, 18% and 17%:

```
overBy         = 2, 3, 2
blendedOverPct = (1000x2 + 1000x3 + 1000x2) / 3000 = 2.333
maxSingleOver  = 3                    <- nothing alarming
riskScore      = round(2.333 x 7 + 3 x 3) = round(25.33) = 25
               -> MEDIUM -> [SALES_MANAGER]
```

No single line would trip a naive per-line check. The pattern still routes it to
a manager, and the summary says so in words: *"No single line looks alarming, but
the overage accumulated across the order is what triggered this."*

> **Test:** `risk.test.ts` › "death by a thousand cuts".

### Worked example — the hard escalation override

100 laptops at 0% discount, plus one service line 10 points over:

```
blendedOverPct = (120000x0 + 450x10) / 120450 = 0.037
riskScore      = round(0.037x7 + 10x3) = 30
maxSingleOver  = 10  >= 8   -> HIGH regardless
```

Without the override, a large clean line could bury a badly-broken small one.

> **Test:** `risk.test.ts` › "hard escalation override".

### The score is invariant to a uniform price-list discount

Acme is Gold, and the Gold price list is *base minus 10 percent*. Applied to both
lines, the weights become $2,160 and $405:

```
(2160 x 0 + 405 x 8) / 2565 = 1.2631...     <- identical
riskScore = 33                              <- identical
```

Because the blended overage is a *ratio* of weighted sums, scaling every line by
the same factor cancels. This is why the seeded Q-1042 still scores exactly 33
with real tier pricing applied (see `DECISIONS.md` D-015).

### The explanation payload

`calculateBlendedRisk` always returns an `explanation` array, one row per line:

```ts
{ lineId, line, category, given, allowed, overBy, status: 'OK' | 'OVER', weight }
```

Screen 6's *Why This Quote Was Flagged* table renders it **verbatim**. The UI
never recomputes any of these numbers — what the approver reads is exactly what
the engine decided on.

---

## 2. Line pricing and margin

**File:** `logic/pricing.ts` · **Tests:** `test/pricing.test.ts`

```
lineGross    = unitPrice x qty
lineDiscount = round(lineGross x discountPct / 100)
lineNet      = lineGross - lineDiscount
lineTax      = round(lineNet x taxPct / 100)      <- tax on the DISCOUNTED amount
lineTotal    = lineNet + lineTax
lineMargin   = lineNet - (costPrice x qty)
marginPct    = lineMargin / lineNet x 100
```

Worked, for Laptop Pro 14 ×2 @ $1,200, 12% off, 15% tax, cost $820:

```
gross     240000c    ($2,400.00)
discount   28800c    (12%)
net       211200c
tax        31680c    (15% of 211200, not of 240000)
total     242880c    ($2,428.80)
cost      164000c
margin     47200c    (22.35%)
```

Everything is an integer count of cents. A test runs the same line 1,000 times
and asserts the accumulated total is *exactly* `242880 × 1000` — no drift.

**Allowed discount:** `min(tierCeiling, categoryCeiling)`.

| | Hardware (15) | Services (10) | Subscription (5) |
|---|---|---|---|
| **Bronze** (5) | 5 | 5 | 5 |
| **Silver** (10) | 10 | 10 | 5 |
| **Gold** (15) | 15 | **10** | 5 |

The Gold/Services cell is the whole reason Q-1042 gets flagged.

**Price lists** (`resolvePriceListPrice`) resolve what the customer pays, and are
a separate concern from discount ceilings:

| Rule | Effect | Seeded as |
|---|---|---|
| `NONE` | base price, unchanged | Bronze |
| `PERCENT_OFF_BASE` | `base − value%` | Silver (5%), Gold (10%) |
| `FIXED_PRICE` | flat override | — |

A per-product `entries[]` override beats the list-wide rule.

---

## 3. Warehouse split planning

**File:** `logic/warehouse.ts` · **Tests:** `test/warehouse.test.ts`

Objective, in strict priority order:

1. minimise the number of shipments
2. minimise weighted shipping cost
3. minimise backordered quantity

### The algorithm

1. **Single-warehouse check.** If any one warehouse can cover *every* line in
   full, use it. One shipment always beats two, whatever the per-unit cost. Ties
   break on the lowest `shippingCostWeight`.
2. **Greedy allocation.** Otherwise rank warehouses by
   `(lines fully coverable DESC, shippingCostWeight ASC)`, then two passes:
   *Pass A* places whole lines that fit entirely in one warehouse — a line is
   never split if it does not have to be. *Pass B* spreads whatever is left.
3. **Backorder.** Anything still outstanding becomes a backorder, with an ETA
   from whichever warehouse restocks that product soonest (an explicit
   `incomingEta` beats the lead-time estimate).
4. **Reservation.** The API then reserves atomically:
   `available = inStock − reserved`. Cancelling an order releases them.
5. **Cost.** `estCost = baseShipmentCost + perUnitShippingCost × qty`, per
   warehouse. Ranking uses `shippingCostWeight`; the estimate uses the two cost
   fields. Two separate numbers, on purpose (`DECISIONS.md` D-019).

### Worked example — the Q-1042 split

Order: 24 × Laptop Pro 14. Live stock:

| Warehouse | In stock | Reserved | **Available** | Weight | Base | Per unit |
|---|---|---|---|---|---|---|
| Main Warehouse | 40 | 22 | **18** | 1.0 | $24 | $1 |
| East Depot | 10 | 4 | **6** | 1.4 | $20 | $1 |

Neither can cover 24 alone, so the order splits. Main ranks first (lower weight):

```
Main Warehouse   18 units   1 shipment   $24 + 18x$1 = $42
East Depot        6 units   1 shipment   $20 +  6x$1 = $26
                 --------              ------------------
                 24 units   2 shipments             $68     0 backordered
```

`rationale` (shown on screen 8, so the logic is provably real):

> No single warehouse can cover the whole order (24 units across 1 line), so the
> order is being split. · Warehouses ranked by (lines fully coverable DESC,
> shipping cost weight ASC): Main Warehouse [weight 1] > East Depot [weight 1.4].
> · Main Warehouse covers a partial remainder of 18 units: Laptop Pro 14 ×18. ·
> East Depot covers a partial remainder of 6 units: Laptop Pro 14 ×6. · Final
> plan: 2 warehouse(s), 2 shipment(s), estimated cost 6800 minor units, 0 unit(s)
> on backorder.

### Backorder and consolidation

Order 30 instead of 24: 24 allocate, 6 backorder. ETA comes from Main (5-day lead
time) rather than East (9 days). `checkBackorderConsolidation()` flips the
fulfillment to `CONSOLIDATION_AVAILABLE` the moment a restock covers the
shortfall, which is what raises the *Consolidate Remaining Backorder* banner on
screen 8.

> **Tests:** 14 in `warehouse.test.ts`, including the exact 18/6 split, the $42
> and $26 estimates, whole-line preference, the ETA source, and consolidation.

---

## 4. Hybrid billing, proration and cancellation

**File:** `logic/billing.ts` · **Tests:** `test/billing.test.ts`

### One order, two artefacts

A confirmed order splits into:

- **One-time lines** → an `Invoice` for the **shipped** quantity only
- **Recurring lines** → a `Subscription` with its own generated
  `BillingSchedule`, invoiced at the **beginning** of each period

They never overlap. A reset assertion and a smoke step both check that no product
appears on both the one-time and the recurring invoice for the same order.

### Nothing is billed before it ships

```
invoiceable_qty = min(qtyShipped, qty) - qtyInvoiced
```

Order 24, ship 18 → invoice 18. Ship the remaining 6 → invoice 6. Never 24 twice,
never more than was ordered even if over-shipped.

### Billing schedules

`nextBillingDates(start, cycle, count)` walks the calendar correctly:
Jan 31 + 1 month → **Feb 28**, not Mar 3. `dueDate === periodStart`, and
`periodEnd` is the day before the next period opens.

| Cycle | Step | Nominal days (proration) |
|---|---|---|
| `WEEKLY` | +7 days | 7 |
| `MONTHLY` | +1 calendar month | 30 |
| `QUARTERLY` | +3 calendar months | 90 |
| `YEARLY` | +12 calendar months | 365 |

### Mid-cycle proration

```
fraction = remainingDays / cycleDays
credit   = round(oldAmount x fraction)
charge   = round(newAmount x fraction)
net      = charge - credit
```

`net > 0` → added to the next invoice. `net < 0` → a `CreditNote` is issued.

Worked — halfway through a 30-day month, $46 → $92:

```
fraction 15/30 = 0.5
credit   $23.00
charge   $46.00
net      +$23.00   -> next invoice
```

Downgrade $92 → $46 over the same remainder gives `net = −$23.00` → credit note.

### Cancellation

| Rule | Credit | Service ends |
|---|---|---|
| `PRORATED` | unused remainder of the period | immediately |
| `FULL_PERIOD` | none | at the end of the paid period |
| `NONE` | none | immediately |

### Invoice lifecycle

`DRAFT → ISSUED → PARTIALLY_PAID → PAID`, plus `OVERDUE` when the due date
passes unpaid. Recording a payment advances the invoice and the order stepper:
`Order Confirmed → Shipped → Invoiced → Paid`.

> **Tests:** 21 in `billing.test.ts`, covering calendar clamping, all three
> proration rules, all three cancellation rules, partial invoicing, and the
> never-double-bill guarantee.

---

## 5. Upsell and cross-sell ranking

**File:** `logic/upsell.ts` · **Tests:** `test/upsell.dealHealth.test.ts`

```
score = coPurchaseFrequency x w1
      + isPromoted          x w2
      + normalizedMarginDelta x w3
```

Defaults `w1 = 0.5`, `w2 = 0.2`, `w3 = 0.3`, all configurable on screen 18.
`marginDelta = unitPrice − costPrice`; it is normalised against the best
candidate in the set so all three signals live on the same 0–1 scale.

Filtered by `marginDelta >= minMarginThreshold`, excluding anything already in
the cart, capped at `maxSuggestions` (3).

Seeded pairings against Laptop Pro 14 give exactly the mockup's panel:

| Suggestion | Margin delta | Co-purchase | Promo |
|---|---|---|---|
| Wireless Mouse | **+$18** | 78% | — |
| Care Plan 2yr | **+$46** | 62% | — |
| Docking Station | +$40 | 41% | **Promo, 12% off** |

Every suggestion carries a plain-language `reason`
(*"Bought alongside Laptop Pro 14 in 78% of past deals; adds 1800 minor units of
margin."*). Adding one is an ordinary line-add, so the margin indicator moves in
the same frame — no round-trip.

---

## 6. Deal-health rules

**File:** `logic/dealHealth.ts` · **Tests:** `test/upsell.dealHealth.test.ts`

| Rule | Condition | Default | Severity |
|---|---|---|---|
| **Stalled** | `now − lastActivityAt > stalledDays` and stage ∉ {CONFIRMED, REJECTED} | 7 days | HIGH past 2× the threshold |
| **Discount anomaly** | `avgDiscountPct > repTrailingAvg × multiplier` **or** `> absoluteCap` | ×2.0, cap 25% | HIGH when over the cap |
| **Delivery slippage** | `projectedDeliveryDate > promisedDeliveryDate` | — | HIGH past 7 days late |

The anomaly rule compares against **the owning rep's own** trailing average, not
a global one — that is what makes it an anomaly rather than just a big discount:

- J. Rao averages 8%. A quote at 32% is 4× his norm **and** over the cap → HIGH.
- S. Nair averages 11%. The same 32% is under 3× his norm but still over the cap
  → flagged. At 24% he would not be flagged at all.

`avgDiscountPct` is **revenue-weighted**, so one tiny line at 50% cannot drag a
large clean order's average up.

Actions: **nudge** (notify the rep) and **escalate** (assign to the manager).
Both write an activity record and an audit entry.

---

## 7. Approval routing and the audit trail

**Files:** `logic/risk.ts` (`resolveApprovalChain`), `apps/api/src/modules/approvals`

```
riskLevel -> chain
  NONE   -> []                              auto-approved, quote goes straight to the customer
  MEDIUM -> [SALES_MANAGER]
  HIGH   -> [SALES_MANAGER, FINANCE]        Finance only becomes active after the Manager approves
```

Steps advance one at a time. **Approve** activates the next step, or finishes the
approval and moves the quotation to `APPROVED`. **Return for revision** sends the
quotation back to `DRAFT` with the reason attached. **Reject** is terminal.

### The re-approval loop

When a customer counters or confirms in the portal, the risk is **recomputed**
against the new terms. If it now breaches the thresholds, the quotation is forced
back to `PENDING_APPROVAL` with the audit reason
`RE_ENTERED_FROM_NEGOTIATION` — **nobody requested this review**. It is the
single most impressive moment in the demo.

### Everything is auditable

Every approval, rejection, edit, discount change, override and negotiation event
writes an `AuditLog`:

```ts
{ actor, actorId, role, action, entity, entityId, entityLabel,
  before, after, reason, timestamp }
```

A reset assertion fails if any audit entry lacks an actor.

---

## 8. Configuration drives everything

Screen 18 is not a settings page that nothing reads. `PUT /api/v1/config`:

1. saves the new ceilings and thresholds,
2. re-prices and re-scores **every open quotation** (DRAFT, PENDING_APPROVAL,
   NEGOTIATION, APPROVED),
3. auto-approves any that no longer need a human, closing their pending approval
   with an explanatory trail entry,
4. writes one audit entry with before/after and the mandatory reason,
5. returns the list of what moved, which screen 18 renders underneath the form.

Smoke step 12 proves it end to end: raise Gold and Services to 20%, and Q-1042
goes **33 → 0** and auto-approves, live. Nothing about the risk engine is
hardcoded, and this is how you show it in fifteen seconds.
