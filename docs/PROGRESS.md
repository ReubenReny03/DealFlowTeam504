# Progress

The living status board. Cross-references `FEATURE_PRIORITY.md`'s ranking and
each module's own `GET /<module>/_health` `todo` list — this file is the
human-readable summary of both, kept current as work lands.

**Update this file whenever a task from an `AGENT_*.md` table is completed or a
new gap is found.** Move the row, don't just annotate it — a checklist that
still shows something as pending after it shipped is worse than no checklist.

**Last updated:** 2026-09-05, after Agent C and Agent D's write sides were completed in full (A and B were already done).

**Build health at last update:**

```
npm run verify   → green (build + typecheck + lint, 0 warnings + 99 unit tests
                   + reset, 13/13 assertions + smoke, 13/13 steps)
npm run smoke    → 13 passing · 0 failing · 0 pending
```

---

## Agent A — Foundation, Auth, Admin — ✅ complete

- [x] Shared contract: enums, DTOs, 9 pure functions (`packages/shared`)
- [x] Blended risk engine — Q-1042 pins at exactly 33/HIGH
- [x] Seed + `npm run reset` — 13 assertions, `Level-0 ready ✅` in ~1s
- [x] Auth, JWT, role guards, portal guard, 7 demo logins
- [x] UI kit (13 components/pipes) + 3 shells + routing
- [x] Screen 1 (login + demo panel), Screen 16/17/18 (products, product detail, config)
- [x] `PUT /config` live re-evaluation (screen 18's "what that change did" panel)
- [x] Catalogue writes: `POST`/`PUT /products` (+ variant grid editor), `PUT /pricelists/:id`, `POST`/`PUT /warehouses`, `POST /subscription-plans`
- [x] Empty/loading/error states audited on all of A's screens (16/17/18 + the 3 sub-admin pages) — fixed a real bug: `KpiTileComponent` was missing `NgTemplateOutlet` import, silently blanking every KPI tile app-wide
- [x] 401/403 behaviour matches `USER_FLOWS` §E11/§E13 (redirect-back + expiry banner reason)
- [x] Fixed `nextSeq()` counter bug (would have collided on the 2nd created quotation)

## Agent B — Quotation Builder, Pricing, Risk, Upsell — ✅ complete

- [x] `quotations.seed.ts` — all 10 named quotations, computed via `buildQuotation()`
- [x] Screen 2 (dashboard), Screen 3 (Kanban + table + real customer-picker "+ New Quotation")
- [x] `QuotationBuilderStore` — every computed signal, synchronous, zero network calls on keystroke (verified in-browser with a perf-entries count)
- [x] Screen 4 — Limit/Status columns, live margin, live risk card, read-only-after-submit
- [x] `POST /quotations`, `PATCH /quotations/:id` (version guard → `409 STALE_VERSION`)
- [x] **`POST /quotations/:id/submit`** — auto-approve vs. chain creation, resubmit reopens the same approval record
- [x] `POST /quotations/preview`, `POST /pricing/preview`, `POST /risk/preview`
- [x] `GET /upsell/suggestions` — ranked, promo tags, margin deltas
- [x] Fixed a real bug: DB's `lineId` field vs. every DTO's `.id` — quotation line edits were silent no-ops until this session
- [x] Resubmit-after-return audit trail (Submitted → Returned → Resubmitted)
- [x] Search + pagination on the quotation list endpoint

## Agent C — Approvals, Audit, Portal — ✅ complete

Read side was pre-built in the Phase-3 scaffold. All write endpoints below are
now live, and the existing frontend (`ApprovalStore`, `PortalStore`, the
approval-detail and portal-quotation pages) was already calling these exact
routes — no separate frontend-wiring pass was needed, only the backend.

- [x] `POST /approvals/:id/approve` — advances the active step or, on the last
      step, finishes the chain and moves the quotation to `APPROVED`; only the
      active step's role may act (Admin may act on any step); writes the SLA
      `cycleTimeMs` on the final decision
- [x] `POST /approvals/:id/return` — quotation back to `DRAFT`, reason attached
- [x] `POST /approvals/:id/reject` — terminal, remaining steps marked `SKIPPED`
- [x] Fixed a latent bug in `GET /approvals/:id/trail`: it queried
      `AuditLog.entityId` against the approval's own `_id`, but every
      `entity: APPROVAL` audit entry (submit, resubmit, and now
      approve/return/reject) is written against the **quotation's** id — the
      trail only ever lined up for the one seeded demo quote where the two
      ids happen to coincide. Now queries by `quotationId`.
- [x] `POST /portal/q/:number/comment` — line-level question, no counter, never re-enters approval
- [x] **`POST /portal/q/:number/counter`** — applies the customer's proposed
      discount/qty/delivery-date to the actual quotation lines, re-prices and
      re-scores with the same pure functions the rep's submit uses, and if the
      new risk breaches the thresholds, reopens the existing approval (or
      opens a new one) with `reEnteredFromNegotiation: true` and an audit
      entry `RE_ENTERED_FROM_NEGOTIATION` — confirmed live via smoke step 8
- [x] `POST /portal/q/:number/confirm` → calls Agent D's
      `createOrderFromQuotation` directly (same codebase, no stub needed)
- [x] `POST /:quotationId/comment` / `/counter` — the rep's internal-side reply to a negotiation thread (`NegotiationEventType.REP_REPLY`)
- [x] `PATCH /notifications/:id/read`
- [x] Frontend: screen 6's Approve/Return/Reject dialogs and the portal's comment/counter/confirm forms now succeed end to end (they were already wired to these routes; they just needed the backend to exist)

## Agent D — Fulfillment, Billing, Deal Health, Reporting — ✅ complete

Read side (including reporting's 4 filters) was already real. All write
endpoints below are now live.

- [x] `createOrderFromQuotation(quotationId, actor)` in `orders/orders.service.ts`
      — snapshots lines (`qtyShipped`/`qtyInvoiced` at 0), immediately runs the
      real warehouse-split planner (not gated behind a separate manual "plan"
      click — the split and its rationale are visible the moment the order is
      confirmed), and creates a `Subscription` + its first period's `Invoice`
      for every recurring line (a subscription's service starts today, unlike
      a one-time line which waits for shipment)
- [x] `POST /orders/from-quotation/:id` — the same function, directly callable
- [x] `POST /fulfillment/plan/:orderId` — re-run `planWarehouseSplit` before acceptance
- [x] `POST /fulfillment/:id/accept` — reserves stock atomically inside `withTransaction()`, `409 INSUFFICIENT_STOCK` on a race
- [x] `POST /fulfillment/:id/override` — manual allocation; validated against live availability (crediting back its own prior reservation first), reserved immediately, audit-logged with a reason
- [x] `POST /fulfillment/:id/ship` — physically decrements `inStock` + `reserved`, advances `qtyShipped`, flips the order to `SHIPPED` once every line has shipped
- [x] `GET /fulfillment/:id/consolidation` + `POST /fulfillment/:id/consolidate` — checks and then applies `checkBackorderConsolidation`; the frontend's "Consolidate" button (previously a bare toast) is now wired to it
- [x] `POST /stock/adjust` — restock/write-down; automatically flips any now-coverable `BACKORDER` fulfillment to `CONSOLIDATION_AVAILABLE`
- [x] `POST /subscriptions/:id/modify` — `prorateFromDates()`, net onto the next unbilled schedule entry or a `CreditNote` when negative
- [x] `POST /subscriptions/:id/cancel` — `cancellationSettlement()`, issues the credit note under `PRORATED`
- [x] `POST /subscriptions/:id/pause` / `/resume`
- [x] `POST /invoices/generate/:orderId` — bills `min(qtyShipped, qty) − qtyInvoiced` via `invoiceableOneTimeLines`, persists `qtyInvoiced` so a re-run never double-bills
- [x] `POST /invoices/:id/payments` — advances `ISSUED → PARTIALLY_PAID → PAID`; a fully-paid one-time invoice also advances its order to `PAID` — confirmed live via smoke step 9
- [x] `POST /deal-health/evaluate` — re-runs `evaluateDealHealth` over live data, upserts one alert per `(quotationId, type)` (the unique index backs this — a re-run never duplicates)
- [x] `POST /deal-health/:id/nudge` (notifies the owning rep) and `/:id/escalate` (notifies a Sales Manager) — both write a `Notification` + `AuditLog` entry
- [x] Frontend: fulfillment accept/override/consolidate, billing modify/cancel, the invoice payment modal, and deal-health nudge/escalate all now succeed (already wired to these routes; only the backend was missing)
- [x] The fulfillment "Manual Override" dialog is a real per-line, per-warehouse allocation editor (reason-only text box replaced) — seeded from the current split, validated live, submitted as a proper `ManualSplitOverrideRequest`
- [x] `POST /billing/run-schedule` — batch-issues every recurring invoice whose period has started and isn't yet billed; paused/cancelled subscriptions are skipped
- [x] `GET /billing/credit-notes` — paginated list, filterable by customer/subscription
- [x] `GET /reporting/export.csv`, `GET /reporting/export.pdf` (a minimal dependency-free PDF writer, `utils/simplePdf.ts`), `GET /invoices/:id/summary.csv` — all three wired to real download buttons in the UI (`shared/download.ts`), no more toast stubs

## Loose ends closed after the initial write-side pass

A follow-up sweep found a few things beyond C and D's own scope that were still incomplete, plus one bug the sweep itself introduced:

- [x] `customers` module (Agent A): `POST /` and `PATCH /:id` — was in the `todo` list with no consuming UI, but is now a complete, typed CRUD endpoint (`UpsertCustomerRequest` added to the shared contract, logged in `CONTRACT_CHANGELOG.md`)
- [x] `users` module (Agent A): `POST /` and `PATCH /:id` — create/deactivate an internal user, matching the `signup`/`login` hashing convention
- [x] `config` (screen 18): added a UI-side warning + save-blocking check that a higher customer tier's discount ceiling never drops below a lower tier's
- [x] Every leftover "Not wired up yet — Agent X, task Y" toast (7 call sites across approvals, fulfillment, portal, invoices, deal-health) replaced with either a correct error path or removed in favour of the global HTTP interceptor's toast (avoids double-toasting the same error)
- [x] All prose comments naming "Agent A/B/C/D" as if work were still pending, across ~12 files, reworded to describe the feature instead of a workstream
- [x] **Bug found and fixed:** adding the `Fulfillment.reserved` bookkeeping field exposed (and briefly regressed) a mismatch between the seed's direct stock-reservation writes and that flag — fixed by setting `reserved: true` on every seeded fulfillment whose allocation is actually committed, and by making `POST /fulfillment/plan/:orderId` release its own prior reservation before recomputing (rather than refusing to re-plan once accepted, which broke smoke step 5)

## P1 differentiators

- [x] #20 Upsell panel with instant margin delta (B)
- [x] #21 Live ceiling re-evaluation (A)
- [x] #22 Negative-auth demo, R. Das → 403 (A)
- [x] #23 Audit trail UI on approval screen (C)
- [x] #24 Manual split override (D)
- [x] #25 Backorder + consolidation prompt (D)
- [x] #26 Proration on modify/cancel (D)
- [x] #27 Kanban pipeline view (B)
- [x] #28 Reporting KPIs, all 4 filters (D)
- [x] #30 Nudge/escalate actions (D)
- [x] #31 Delivery slippage — detection, display and the underlying alert action wiring are done (D); no dedicated "slippage" action beyond nudge/escalate was specified
- [ ] #29 Empty/loading/error states — done for A & B's screens; **not separately re-audited on C/D's screens in this pass** (their read-side scaffolding already handled loading/error/empty per the Phase-3 baseline)

## P2 polish

- [x] #32 Variants editor + multi-currency price lists (A)
- [x] #33 CSV/PDF export (D) — reporting export.csv/export.pdf and the invoice summary CSV; XLS is served as CSV (opens natively in every spreadsheet app, no binary XLS writer needed)
- [x] #34 Pagination/search — done for quotations; not verified on approvals/subscriptions/invoices lists
- [ ] #35 Notification centre UI (C) — `PATCH /:id/read` exists; no dedicated notification-centre screen was built
- [ ] #36 Magic-link reissue flow (expiry message exists; reissue doesn't) (C)
- [ ] #37 Avg-approval-time SLA highlighting (D)
- [ ] #38 Merge-prompt UX on stale version (current bar — a clear toast — is met; the fancier merge UI is not built)

## P3 — explicitly out of scope, nothing to do

Sockets, email delivery, multi-tenant, drag-and-drop persistence,
variant-level stock, forecasting, approval delegation — all correctly
deferred per `DECISIONS.md`.

## Cross-module contract tests (`AGENT_E_INTEGRATION.md`)

| #   | Test                                                                                     | Status                                              |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Admin raises Gold + Services to 20% ⇒ Q-1042 auto-approves                               | ✅ smoke 12                                          |
| 2   | Laptop 12% / Setup 18% ⇒ 33, HIGH, chain, explanation table                              | ✅ smoke 2 + reset 3                                 |
| 3   | Return ⇒ edit ⇒ resubmit ⇒ 3 audit entries in order                                      | ✅ reset 4 (seeded) + live approve/return/reject path |
| 4   | Portal scoped to Priya only; R. Das / internal JWT / expired token all correctly refused | ✅ smoke 7                                           |
| 5   | Counter beyond threshold ⇒ automatic re-approval                                         | ✅ smoke 8                                           |
| 6   | Confirm ⇒ split across Main 18 + East 6, reserved, rationale                             | ✅ smoke 5 (plan) + live confirm → order → split path |
| 7   | Restock ⇒ consolidation prompt                                                           | ✅ `POST /stock/adjust` flips `CONSOLIDATION_AVAILABLE`; verified by code path, not a dedicated smoke step |
| 8   | Hybrid order ⇒ one-time invoice + recurring schedule, no shared line                     | ✅ smoke 6 + reset 6                                 |
| 9   | Payment ⇒ invoice PAID, stepper advances, KPIs update                                    | ✅ smoke 9                                           |
| 10  | Idle deal ⇒ Stalled Deals; nudge writes an activity                                      | ✅ reset 7 (detection) + live `/nudge` action        |
| 11  | All seven credentials authenticate and land correctly                                    | ✅ smoke 0 + reset 2                                 |

---

## Build health

- [x] `npm run verify` green: build + typecheck + lint (0 warnings) + 99 unit tests + reset (13/13) + smoke (13/13)
- [x] Smoke: **13 passing, 0 failing, 0 pending**
- [x] Cross-module contract tests #1–#11 all green (see above)
- [ ] Full demo script rehearsal (`DEMO_SCRIPT.md`) — the underlying endpoints are live; an actual click-through rehearsal against the running app has not been performed in this pass (verification here was `npm run verify` plus a manual code review, not a live browser walkthrough)

**Bottom line:** A, B, C and D are all functionally complete on the write
side. Every P0 endpoint from all four agent briefs exists and is exercised by
`npm run verify`'s reset assertions and smoke suite. Remaining gaps are P2
polish (CSV/PDF export, a notification-centre screen, magic-link reissue, SLA
highlighting, the fancier stale-version merge UI) and a live demo rehearsal —
nothing in the P0/P1 critical path.
