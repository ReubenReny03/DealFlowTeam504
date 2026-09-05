# UI specification

Angular 17 standalone components, signal-based stores, Tailwind. Every screen,
its component tree, its route, its store bindings, its states and its exact copy.

## Ground rules

- **Standalone components only.** No NgModules. `ChangeDetectionStrategy.OnPush`
  everywhere.
- **Signals, not RxJS, for state.** Stores expose `signal()` and `computed()`;
  components read them directly in templates.
- **Never rebuild a shared component.** The kit is in `app/shared/ui/`. If you
  need a table, a chip, a stepper or a dialog, it is already there.
- **Never redefine a type.** Everything comes from `@dealflow/shared`.
- **Never hardcode a label or a colour.** `STAGE_LABEL`, `RISK_LEVEL_LABEL`,
  `STATUS_COLORS`, `EMPTY_STATES` are all in `@dealflow/shared/constants`.
- **Every screen has four states:** loading, error, empty, and content. All four
  are components; none of them is a blank div.
- **Wide content scrolls inside its own box** (`.df-scroll-x`). The page body
  never scrolls sideways.

### Angular gotcha

`@else if (expr; as alias)` is **not supported** — only `@if` takes the alias.
Every page therefore uses:

```html
@if (store.loading()) { … }
@else if (store.error()) { … }
@else {
  @if (store.data(); as d) { … }
}
```

Also: a Tailwind opacity class cannot go in a class binding — `[class.bg-rose-50/50]`
fails to parse. Use `[class]="cond ? 'bg-rose-50' : ''"`.

---

## The shared UI kit — `app/shared/ui/`

| Component | Selector | What it is for |
|---|---|---|
| `StatusChipComponent` | `df-status-chip` | Every coloured pill. `kind` = stage · risk · tier · invoice · subscription · fulfillment · approval · category · cycle. One component, so HIGH is the same red everywhere. |
| `KpiTileComponent` | `df-kpi-tile` | Dashboard tiles. `label`, `value`, `caption`, `link`, `tone`. |
| `DataTableComponent` | `df-data-table` | The one table. `columns: ColumnDef[]`, `rows`, `clickable`, `rowClick`. Supply a `#cell` template for rich cells. |
| `StepperComponent` | `df-stepper` | Horizontal stepper. `steps: {label, state, caption}[]`, state = done · active · pending · failed. |
| `KanbanBoardComponent` | `df-kanban-board` | Screen 3's pipeline. `board: KanbanBoardDto`, `cardClick`. |
| `ModalComponent` | `df-modal` | Dialog. Escape and the backdrop both close it. |
| `ConfirmDialogComponent` | `df-confirm-dialog` | Confirmation **with a mandatory reason**. Every audited action uses it. |
| `EmptyStateComponent` | `df-empty-state` | `title`, `body`, `cta`, `icon`. Copy comes from `EMPTY_STATES`. |
| `LoadingComponent` | `df-loading` | Skeleton rows. |
| `ErrorStateComponent` | `df-error-state` | Failure with a retry. |
| `ToastHostComponent` | `df-toast-host` | Global notifications; the HTTP interceptor pushes errors here. |
| `MoneyPipe` \| `PercentPipe` | `money` \| `pct` | `120000 \| money` → `$1,200.00` |
| `ShortDatePipe` \| `LongDatePipe` \| `AgoPipe` | | `Sep 15` · `Aug 20, 2026` · `9 days ago` |

Utility classes in `styles.css`: `.df-card`, `.df-btn-primary` / `-ghost` /
`-success` / `-warn` / `-danger`, `.df-input`, `.df-label`, `.df-th`, `.df-td`,
`.df-chip`, `.df-h1`, `.df-h2`, `.df-muted`, `.df-scroll-x`.

## Stores — `app/core/state/`

| Store | Owns | Key signals |
|---|---|---|
| `SessionStore` | who is signed in | `user`, `role`, `isAuthenticated`, `nav`, `portalToken`, `demoAccounts` |
| `QuotationBuilderStore` | **screen 4's brain** | `draftLines`, `pricedLines`, `totals`, `marginAmount`, `marginPct`, `risk`, `willAutoApprove`, `suggestions` |
| `ApprovalStore` | screens 5, 6 | `list`, `counts`, `items`, `current`, `pendingOnly` |
| `FulfillmentStore` | screens 7, 8 | `overview`, `stock`, `awaiting`, `current`, `consolidationAvailable` |
| `BillingStore` | screens 9, 10, 12, 13 | `subscriptions`, `invoices`, `detail`, `invoice` |
| `DealHealthStore` | screen 14 | `dashboard`, `alerts` |
| `ReportingStore` | screen 15 | `dashboard` |
| `AdminConfigStore` | screen 18 | `config`, `lastImpact` |
| `PortalStore` | screen 11 | `data`, `quotation`, `events`, `canConfirm`, `errorCode` |
| `ToastStore` | notifications | `toasts` |

### `QuotationBuilderStore`, in detail

Everything is a `computed()` recalculated **synchronously** on every mutation,
through the same pure functions the API uses on save:

```
draftLines  -> pricedLines   (computeLinePricing per line)
            -> totals        (computeQuoteTotals)  -> subtotal, discountTotal,
                                                      taxTotal, grandTotal,
                                                      oneTimeTotal, recurringTotal
            -> margin        (computeMargin)       -> marginAmount, marginPct
            -> risk          (calculateBlendedRisk) -> riskScore, riskLevel,
                                                       explanation, requiredChain
            -> willAutoApprove
```

That is why the margin moves in the same frame as the click, and why the
preview cannot disagree with what the server stores.

## Routing — `app/app.routes.ts` (append-only)

| Path | Guard | Shell | Screen |
|---|---|---|---|
| `/login` · `/signup` | — | — | 1 |
| `/app/dashboard` | `internalGuard` | Internal | 2 |
| `/app/quotations` · `/app/quotations/:id` | `internalGuard` | Internal | 3, 4 |
| `/app/approvals` · `/app/approvals/:id` | `roleGuard([ADMIN, SALES_MANAGER, FINANCE])` | Internal | 5, 6 |
| `/app/fulfillment` · `/:id` | `internalGuard` | Internal | 7, 8 |
| `/app/subscriptions` · `/:id` | `internalGuard` | Internal | 9, 10 |
| `/app/invoices` · `/:id` | `internalGuard` | Internal | 12, 13 |
| `/app/deal-health` | `internalGuard` | Internal | 14 |
| `/app/reports` | `roleGuard([ADMIN, SALES_MANAGER, FINANCE])` | Internal | 15 |
| `/admin/products` · `/:id` | `roleGuard([ADMIN, SALES_MANAGER])` | Admin | 16, 17 |
| `/admin/config` | `roleGuard([ADMIN, SALES_MANAGER])` | Admin | 18 |
| `/admin/pricelists` · `/warehouses` · `/plans` | `roleGuard([ADMIN, SALES_MANAGER])` | Admin | — |
| `/portal/quotations` (the company's list, and where `/portal` lands) | **`portalGuard`** | **Portal** | 11 |
| `/portal/quotation` · `/portal/q/:number` | **`portalGuard`** | **Portal** | 11 |
| `/portal/messages` · `/portal/profile` | **`portalGuard`** | **Portal** | 11 |

Every feature is lazy-loaded. Route params bind to component `input()`s via
`withComponentInputBinding()`.

## Every list view searches and pages

Every list screen carries a `df-search-box` and a `df-paginator`, both wired to
server-side `?q=`/`?page=`/`?pageSize=` — nothing is filtered or sliced in the
browser, so a 149-row collection never arrives in one response.

The shared pieces, so no screen reimplements them:

| Piece | What it is | Where |
| --- | --- | --- |
| `df-search-box` | debounced (250 ms) input with a clear button and Esc-to-clear | `shared/ui/search-box.component.ts` |
| `df-paginator` | Prev/Next with "Page 2 of 6 · 149 total"; renders nothing at one page | `shared/ui/paginator.component.ts` |
| `ListQuery` | the `q` / `page` / `pageSize` / `total` state a store or page holds | `core/state/list-query.ts` |

`ListQuery` enforces the two rules that are easy to get wrong by hand: a **new
search term resets to page 1** (or the user lands on page 4 of a two-page result
and sees nothing), and `applyMeta` **steps back off a page that no longer
exists** after a delete or a narrowing search.

`df-empty-state` takes `[filtered]` and `[searchTerm]`, and swaps to the
`NO_MATCHES` copy with a *Clear search* button. "You have no invoices" and
"nothing matches *acme*" are different facts; showing the first when the second
is true sends people hunting for a bug that is not there.

Screens with two lists (Fulfillment: stock and awaiting orders) share one search
box and keep a paginator per table.

## The three shells

**`InternalShellComponent`** — white sticky header, the mockup's nav in order:
Dashboard · Quotations · Approvals · Fulfillment · Subscriptions · Invoices ·
Deal Health · Reports · Products. Filtered by role from `INTERNAL_NAV`.
Right side: a *Back-end* link (**Admin only**), the notification bell, the
user's initials and name, **Sign out**. Hiding the link is a convenience, not a
boundary — `roleGuard` on `/admin` is what refuses everyone else.

**`AdminShellComponent`** — dark header, deliberately different so you always
know you are in configuration. Nav: Products · Price Lists · Warehouses ·
Subscription Plans · Discount Tiers & Approvals. Plus *Open sales workspace*.

**`PortalShellComponent`** — light, narrow (`max-w-4xl`), three tabs: **My
Quotation · Messages · Profile**. **No route back into the internal app**, because
there is none to offer. Footer: *"This page is a live document. Anything you
propose here reaches your account manager immediately."*

---

# Screens

## Screen 1 — Login / Signup · `/login` · Agent A

```
LoginPage
├─ left:  brand · reason banner · email · password · Sign in · link to signup
└─ right: Demo accounts panel (7 personas, one-click sign-in)
```

Binds `SessionStore.login()`, `loadDemoAccounts()`, `demoAccounts`, `loading`,
`error`. The demo panel renders only when `environment.showDemoLogins`.

**States** — *error:* "Email or password is incorrect." (identical either way, so
nothing leaks). *Expired session:* amber, "Your session ended. Please sign in
again." *Portal redirect:* sky, "That quotation link needs a customer sign-in…"
*API down:* the panel says so and names `npm run dev:api` / `npm run reset`.

After sign-in: `?redirect=` if present, else `LANDING_ROUTE[role]`.

**Signup** adds a **Team** selector; choosing *Customer* reveals **Company** with
the helper *"Your account will only ever be able to open this company's
quotations."*

---

## Screen 2 — Sales Dashboard · `/app/dashboard` · Agent B

```
DashboardPage
├─ header: "Good to see you, {name}" · [+ New Quotation] [View Approvals]
├─ 3 × df-kpi-tile
├─ Your quotations  (rows → /app/quotations/:id)
└─ Recent activity  (from the audit log)
```

| Tile | Value | Caption | Links to | Tone |
|---|---|---|---|---|
| Pending Approvals | count | "N quotations waiting" | `/app/approvals` | warn if > 0 |
| Open Quotations | count | "N active deals" | `/app/quotations` | neutral |
| At-Risk Deals | count | "N flagged by Deal Health" | `/app/deal-health` | danger if > 0 |

*View Approvals* shows only for SALES_MANAGER, FINANCE, ADMIN.
Empty: the `quotations` empty state with **+ New Quotation**.

---

## Screen 3 — Quotations · `/app/quotations` · Agent B

```
QuotationListPage
├─ header: [Switch to Table View] [+ New Quotation]
└─ df-kanban-board  |  df-data-table   (toggled)
```

**Kanban** columns in order: Draft · Pending Approval · Approved · Negotiation ·
Confirmed. Each header carries a count and a column total. Each card: customer
name, quotation number, amount, a tier chip, a risk chip (or *"Within limits"*
in green when the score is 0), and last activity.

**Table** columns: Quotation · Customer · Tier · Owner · Stage · Blended Risk ·
Amount · Last activity.

---

## Screen 4 — Quotation Detail · `/app/quotations/:id` · Agent B

**The most-watched screen in the demo.**

```
QuotationDetailPage
├─ header: number · customer · stage + tier chips
│          [Discard changes] [Save Draft] [Submit for Approval]
├─ main (2/3): line table · the "checked against its own limit" note · add-a-product
└─ aside (1/3): Live totals + Margin · Blended risk · Upsell suggestions
```

**Line table** — Product · Qty · Price · Discount · **Limit** · **Status** ·
Total · remove. Qty and Discount are inputs; every keystroke recalculates.

**Status cell:**
- within limit → green chip **OK**
- over → red chip **OVER (+Npt)**, and the row tints (`bg-rose-50`)

Under the table, verbatim:

> *"Each line's discount is checked against **its own** limit — the stricter of
> the customer's tier ceiling and the product category's ceiling — as soon as you
> enter it, not only when you submit."*

**Live totals** — Subtotal, Discount (red, negative), Tax, **Total**, and a
recurring-per-cycle line when the cart is hybrid.

**Margin block** — colour-coded: emerald ≥ 20%, amber ≥ 10%, rose below. Shows
amount and percentage. **This is what must visibly move when an upsell is added.**

**Blended risk card** — a risk chip reading `LEVEL · score`, the engine's own
`summary` sentence, and then either:
- green: *"Submitting now would go straight to the customer — no approval needed."*
- amber: *"Submitting now routes to SALES_MANAGER, then FINANCE."*

**Upsell panel** — per suggestion: name, `Margin +$X` in green, a promo tag if
any, the plain-language reason, and **Add to Quote** / **Dismiss**. Adding is an
ordinary line-add, so the margin moves immediately. An added line carries a
*from upsell* badge.

---

## Screen 5 — Approvals · `/app/approvals` · Agent C

```
ApprovalListPage
├─ header + [Pending Only] checkbox
├─ chips: N Pending · N Returned · N Approved · N Rejected
└─ df-data-table
```

Columns: Quotation · Customer · **Blended Risk** (chip + numeric score) ·
**Stage** (the role holding the ball, or an *Auto-Approved* chip) ·
**Assigned To** · Amount · Submitted.

Empty state, verbatim: *"Nothing waiting on you — Quotations only land here when
their blended risk score requires a human. An empty queue means every open deal
is inside its discount limits."*

---

## Screen 6 — Approval Detail · `/app/approvals/:id` · Agent C

**The money shot.**

```
ApprovalDetailPage
├─ header: number · customer · [Blended Risk: HIGH] [Customer Tier: GOLD] [status]
│          [Open the quotation]
├─ df-stepper: Submitted → Sales Manager → Finance → Confirmed
├─ main (2/3): "Why This Quote Was Flagged" · the explanatory note · Audit trail
└─ aside (1/3): Your decision · "Back from the customer" panel (conditional)
```

**Why This Quote Was Flagged** — rendered **verbatim** from
`approval.risk.explanation`. The UI recomputes nothing.

| Line | Discount Given | Limit Allowed | Over By | Weight |
|---|---|---|---|---|
| Laptop Pro 14 / Hardware | 12% | 15% | `0 pt OK` (emerald) | 84% |
| Onsite Setup Service / Services | 18% | 10% | **`8 pt OVER`** (rose, bold) | 16% |

Over-limit rows tint. Above the table: the score and the engine's `summary`.
Below it, verbatim:

> *"The worst single line over its limit, plus the revenue-weighted pattern
> across the whole order, together set the blended score. One bad line is enough
> to require approval — and many small ones are too."*

**Audit trail** — User · Action · Date · Reason. Q-1042 seeds with exactly three
rows: Submitted / Returned / Resubmitted.

**Decision panel** — **Approve** (green) · **Return for Revision** (amber) ·
**Reject** (red). Each opens `df-confirm-dialog` with a **mandatory** reason and
a message saying what happens next:

| Action | Dialog message |
|---|---|
| Approve (more steps) | "Q-1042 moves on to the next approver in the chain." |
| Approve (last step) | "Q-1042 is fully approved and goes to the customer's portal." |
| Return | "Q-1042 goes back to J. Rao as a draft. They will see your reason and can resubmit." |
| Reject | "Q-1042 is closed for good. The rep would have to start a new quotation." |

Under the reason field: *"This is written to the audit trail with your name and
the time."*

**When `reEnteredFromNegotiation`** — a blue panel: *"**Back from the customer** —
The customer changed the terms in the portal and the quotation re-entered
approval by itself. Nobody asked for this review."*

---

## Screen 7 — Fulfillment and Stock · `/app/fulfillment` · Agent D

```
FulfillmentListPage
├─ Live stock:  Warehouse · Product · In Stock · Reserved · Available
└─ Orders Awaiting Fulfillment:  Order · Customer · Status · Warehouse
```

Subtitle: *"Availability is always in stock minus reserved — a reservation is
real, not a note."* Zero availability renders in rose. Rows in the second table
are clickable. Warehouse column joins allocations with " + " (`Main Warehouse +
East Depot`), or `—`.

---

## Screen 8 — Fulfillment Detail · `/app/fulfillment/:id` · Agent D

```
FulfillmentDetailPage
├─ header: order · customer · status chip · "Manually overridden" chip
│          [Accept Suggested Split] [Manual Override]
├─ Consolidate Remaining Backorder banner  (conditional, sky)
├─ main: Suggested split table (+ totals row) · Backorder table
└─ aside: "Why this split" — the rationale list · Overridden-by block
```

Split table: Warehouse · Lines · **Qty Fulfilled** · **Est. Shipments** ·
**Cost**, with a bold totals row.

**The rationale list is the point of this screen.** It is the plain-English
justification the planner produced, one line per bullet, and it is never empty.

**Consolidation banner** appears automatically when
`consolidationAvailableAt` is set: *"Stock arrived and now covers the outstanding
backorder. You can ship the remainder as one consolidated shipment instead of
leaving it open."* with **Consolidate**.

**Manual Override** opens a confirm dialog with a mandatory reason: *"A manual
allocation is validated against live availability and is written to the audit
trail with your reason."*

---

## Screen 9 — Subscriptions · `/app/subscriptions` · Agent D

Chips: **N Active · N Paused · N Cancelled**. Table: Customer · Plan · Cycle ·
Next Bill · Amount · Status. `—` when there is no next bill date (paused or
cancelled). **+ New Plan (Admin)** goes to `/admin/plans`.

---

## Screen 10 — Billing Detail · `/app/subscriptions/:id` · Agent D

**The screen that proves the hybrid model.**

```
BillingDetailPage
├─ header: customer · "From order ORD-1041 · confirmed {date}"
│          [Modify Subscription] [Cancel Subscription]
├─ left:  One-Time Lines (from the originating order)
├─ right: Recurring Lines  — Plan · Cycle · Next Bill Date · Amount · Status
└─ below: Invoices for this customer
```

Under the recurring table: *"A recurring line is invoiced at the **beginning** of
each period, and never appears on the one-time invoice."*

**Modify** dialog: *"A mid-cycle change is prorated: the unused part of the old
amount is credited, the new amount is charged over the same remainder, and the
net lands on the next invoice — or becomes a credit note if it is negative."*

**Cancel** dialog: *"Cancelling stops the schedule and settles the current period
under the configured cancellation rule. Under PRORATED, a credit note is issued
for the unused days."*

---

## Screen 11 — Customer Portal · `/portal/q/:number` · Agent C

**A deliberately different surface.** Portal shell, portal guard, portal token.

```
PortalQuotationPage
├─ header: quotation number · "Quotation for {customer}" · valid until · stage chip
├─ line table:  Item · Qty · Unit price · Your discount · Total
├─ "Ask about a line, or propose different terms" — per line: comment + counter %
├─ Requested delivery date · Anything else?
├─ the negotiation notice (sky panel)
└─ [Submit Request] [Confirm Quotation]
```

**What is deliberately absent:** margin, cost price, the risk score, the
allowed-discount limit, who is approving, and any link into the internal app.

The notice, verbatim:

> *"You can comment on any line or propose a different discount. If the final
> terms go beyond what your account manager can approve on their own, the
> quotation goes back for internal approval automatically — you will see the
> status change here."*

**After Submit Request**, one of two toasts:
- *"Your proposal goes beyond what your account manager can approve alone, so it
  has gone back for internal approval automatically."*
- *"Your account manager can approve these terms directly."*

**Confirm Quotation** is enabled only while `canConfirm`.

**Error states** carry their own headline, so the customer is never confused:

| Code | Headline | Body |
|---|---|---|
| `PORTAL_TOKEN_EXPIRED` | This link has expired | *"Ask your account manager to send you a fresh link, or sign in with the account they set up for you."* |
| `PORTAL_TOKEN_INVALID` | This link is not valid | same |
| `FORBIDDEN` | This quotation is not yours | *"This quotation belongs to a different company."* |

**Messages** tab: the whole negotiation as a chat, customer messages right-aligned
and dark, rep replies left-aligned and light, each tagged with the line it is
about.

**Profile** tab: name, email, company, and *"This account can only open
quotations belonging to your company."*

---

## Screen 12 — Invoices · `/app/invoices` · Agent D

Subtitle: *"Nothing is billed before it ships — a partial delivery produces a
partial invoice."* Chips: **N Unpaid · N Paid** (+ Overdue when non-zero).
Table: Invoice # · Customer · Type (One-time / Recurring) · Amount · Status ·
Due Date.

---

## Screen 13 — Invoice Detail · `/app/invoices/:id` · Agent D

```
InvoiceDetailPage
├─ header: number · customer · status · issued/due   [Record Payment] [Download Summary]
├─ df-stepper: Order Confirmed → Shipped → Invoiced → Paid
├─ main: line table · "All invoices for ORD-1041"
└─ aside: Balance (Invoiced / Paid / Outstanding) · Payments
```

The related-invoices block is what shows one order producing **two** artefacts,
side by side, with the caption *"One order, two billing artefacts: the one-time
invoice and the recurring schedule, kept separate."*

**Record Payment** opens a modal: amount (with the outstanding shown), method,
reference.

---

## Screen 14 — Deal Health · `/app/deal-health` · Agent D

Three tiles — **Stalled Deals · Discount Anomalies · Delivery Slippage** — then a
table: Deal · Issue · Flagged · Owner · Action.

- **Deal** is a link; clicking opens the quotation.
- **Issue** is a colour-coded chip: amber (stalled), rose (anomaly), sky (slippage).
- **Action** shows **Nudge Rep** / **Escalate** while the alert is open, and the
  recorded note once acted on (*"Nudge sent"*, *"Escalated to Manager"*).

Under each row, the alert's full `detail` sentence in small grey text.

---

## Screen 15 — Reporting · `/app/reports` · Agent D

Four filters across the top — **Period · Sales Rep · Approval Status · Product /
Category** — each re-querying on change. Four KPI tiles: **Quotes Created**,
**Avg Approval Time**, **Top Upsell Product** (with times added), **Conversion**.
Then two tables: by sales rep and by product, each with quantity, value and
average discount. **Export PDF** / **Export XLS**.

---

## Screen 16 — Product Dashboard · `/admin/products` · Agent A

Three tiles — Total Products ("N active, M archived"), Pricelists ("N tiers, M
currencies"), Variants ("N SKUs"). Then the table: Product name · Category ·
Variants · Price · Unit · Tax · Status. A subscription product's price shows
`/month`. Buttons: **+ New Product**, **Manage Price Fields**.

**New Product** is category-aware. Choose **Hardware** and the flat *Quantity on
hand* box is replaced by **Opening stock by warehouse** — one number per active
warehouse, with the resulting quantity on hand adding up live underneath, so a
hardware product is stocked where it is created rather than in a second visit to
another screen. Any other category keeps the plain quantity box and is never
asked about warehouses.

---

## Screen 17 — Product Details · `/admin/products/:id` · Agent A

Four blocks (the last one only for hardware):

**General Info** — name, category, price, unit, tax, quantity on hand,
description, **Subscription Yes/No**, and — only when Yes — **Recurring**. With
the note: *"A recurring order with this product is invoiced at the beginning of
the period."*

**Product Variants** — Attribute · Values · Extra price (e.g. `RAM` /
`4GB, 8GB` / `0, +$30`).

**Pricelists** — Tier · Currency · Price Rule (`price, no adjustment` /
`price minus 10 percent base`). With: *"A tier's price rule sets what the
customer pays. It is separate from the tier's discount ceiling, which lives on
the Discount Tiers & Approvals screen."*

**Warehouse Stock** — **HARDWARE only.** Warehouse · In stock · Reserved ·
Available, one row per active warehouse (zeroes included, so a product that has
never been stocked still names the warehouses it could be stocked in), a totals
row, and a replenishment date where one is inbound. A services or subscription
product does not show the card at all — it is delivered, never shelved. When the
catalogue's `quantityOnHand` and the warehouse total disagree, the card says so
and names the warehouse figure as the one the split planner uses.

The card is read-only: quantities move through a restock or a write-down on
screen 7, so every change carries a reason into the audit trail. The one
exception is creation — see screen 16.

---

## Screen 19 — Users · `/admin/users` · Agent A

**Admin only** — a Sales Manager reaches the rest of the back-end but not this
tab, and the route guards it as well as hiding it.

Table: Name · Email · Role · Company · Status, with the search box, role filter
and paginator every list view has. Your own row is chipped **you** and has no
Deactivate control. Buttons: **+ New User**.

**New user** — full name, email, temporary password, role. The role picker is the
screen: choose an internal role and a one-line hint says what it can do; choose
**Customer** and a required **Company** select appears, because a portal login is
scoped to exactly one company for its whole life and can only ever open that
company's quotations. Under the table: *"Deactivating takes effect on the
account's very next request — the API re-reads the account on every call rather
than trusting a token that was already issued."*

**Edit user** — same modal shape as create, opened from the row's **Edit**. Name
and email always; **Role** for an internal user (internal roles only) or
**Company** for a portal login, never both, because an account cannot cross that
line. A *Set a new password for them* checkbox reveals the reset field, and an
*Account is active* checkbox that is disabled on your own row. A row still on its
issued password carries an amber **new password pending** chip.

**Choose your password** · `/change-password` — where a first sign-in lands.
Current, new, confirm, and **Skip for now**, which goes on to the workspace and
leaves the prompt for next time (D-036). The same screen is the plain "change my
password" form for anyone already past that.

There is **no signup screen**. The login page says so: *"Accounts are issued by an
administrator — there is no self-service signup."* See D-034.

---

## Screen 18 — Discount Tiers & Approvals · `/admin/config` · Agent A

**The screen that proves nothing is hardcoded.**

```
ConfigPage
├─ Tier Discount Ceilings      (Bronze / Silver / Gold, % inputs)
├─ Category Discount Ceilings  (Hardware / Services / Subscription, % inputs)
├─ Approval chain table + threshold inputs
├─ Reason (required) + [Save configuration]
└─ "What that change did" panel   (after a save)
```

Under the category ceilings, verbatim:

> *"A line's real limit is the **stricter** of its tier ceiling and its category
> ceiling. A Gold customer at 15% buying a Service capped at 10% is allowed 10%,
> not 15%."*

**Approval chain table:**

| Situation | Blended risk score | Who must approve |
|---|---|---|
| Within every line's own limit | `0` | No approval needed |
| Over limit, blended risk medium | `1 – 29` | Sales Manager |
| Over limit, blended risk high | `30+` | Sales Manager, then Finance |
| Any single line this far over its own limit | `[8] pts` (editable) | Sales Manager, then Finance — regardless of the score |

Below: *"When a quote mixes categories with different ceilings, the system
computes a blended risk score and routes to the highest required level. All
approvals, rejections and edits are logged with user, timestamp and reason."*

**After saving**, the "What that change did" panel lists every re-scored
quotation — Quotation · Was · Now · Outcome, with a green *"No longer needs
approval"* chip where applicable. **Do this live in the demo.**

---

## Mock mode

Set `environment.useMocks = true` in `apps/web/src/environments/environment.ts`
and every request is answered from `app/core/api/mock.data.ts` instead of the
API. Keys are regexes matched against the request path.

Any frontend workstream can keep moving while its backend counterpart is still
building. Append your module's fixtures to `MOCK_RESPONSES`; do not restructure
what is there.
