# Progress

The living status board. Cross-references `FEATURE_PRIORITY.md`'s ranking and
each module's own `GET /<module>/_health` `todo` list — this file is the
human-readable summary of both, kept current as work lands.

**Update this file whenever a task from an `AGENT_*.md` table is completed or a
new gap is found.** Move the row, don't just annotate it — a checklist that
still shows something as pending after it shipped is worse than no checklist.

**Last updated:** 2026-09-05, after Agent A and Agent B were completed in full.

**Build health at last update:**

```
npm run verify   → green (build + typecheck + lint, 0 warnings + 99 unit tests
                   + reset, 13/13 assertions + smoke)
npm run smoke    → 10 passing · 0 failing · 3 pending (all Agent C/D territory)
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

## Agent C — Approvals, Audit, Portal — ❌ not started (write side)

Read side was pre-built in the Phase-3 scaffold and works today (queue,
counts, "Why This Quote Was Flagged" table renders live/seeded data, audit
trail UI, portal view + the negative-auth 403 boundary). Nothing below is
wired:

- [ ] `POST /approvals/:id/approve` — advance the chain or finish → `APPROVED`
- [ ] `POST /approvals/:id/return` — back to `DRAFT` with reason
- [ ] `POST /approvals/:id/reject` — terminal
- [ ] `POST /portal/q/:number/comment` — line-level question, no counter
- [ ] **`POST /portal/q/:number/counter`** — the re-approval loop (`RE_ENTERED_FROM_NEGOTIATION`) — *the single most-cited demo moment, and the one thing still missing end to end*
- [ ] `POST /portal/q/:number/confirm` → hands off to Agent D's order creation
- [ ] `POST /:quotationId/comment` / `/counter` — the rep's internal-side reply to a negotiation thread
- [ ] `PATCH /notifications/:id/read`
- [ ] Frontend: wire screen 6's Approve/Return/Reject dialogs; wire the portal's comment/counter/confirm forms (UI is built, buttons currently toast "not wired up yet")

## Agent D — Fulfillment, Billing, Deal Health, Reporting — ❌ not started (write side)

Read side works (live stock table, subscriptions/invoices lists with seeded
ORD-1041 hybrid-billing example, deal-health tiles with real counts,
reporting KPIs with all 4 filters). Nothing below is wired:

- [ ] `POST /orders/from-quotation/:id` — called by C on portal confirm
- [ ] `POST /fulfillment/plan/:orderId` — run `planWarehouseSplit`, persist
- [ ] `POST /fulfillment/:id/accept` — reserve stock atomically
- [ ] `POST /fulfillment/:id/override` — manual allocation, validated + audited
- [ ] `POST /fulfillment/:id/ship`
- [ ] `GET /fulfillment/:id/consolidation` — backorder consolidation banner
- [ ] `POST /stock/adjust` — restock, must flip `CONSOLIDATION_AVAILABLE`
- [ ] `POST /subscriptions/:id/modify` — proration, credit note
- [ ] `POST /subscriptions/:id/cancel` — settlement + credit note
- [ ] `POST /subscriptions/:id/pause` / `/resume`
- [ ] `POST /billing/run-schedule` — issue due recurring invoices
- [ ] `POST /invoices/generate/:orderId` — bill shipped quantity only
- [ ] `POST /invoices/:id/payments` — advance invoice + order stepper
- [ ] `POST /deal-health/evaluate`, `/:id/nudge`, `/:id/escalate`
- [ ] Frontend: wire fulfillment accept/override, billing modify/cancel, invoice payment modal, deal-health nudge/escalate buttons (all currently toast stubs)

## P1 differentiators

- [x] #20 Upsell panel with instant margin delta (B)
- [x] #21 Live ceiling re-evaluation (A)
- [x] #22 Negative-auth demo, R. Das → 403 (A)
- [x] #23 Audit trail UI on approval screen (read side, pre-built)
- [x] #27 Kanban pipeline view (B)
- [x] #28 Reporting KPIs, all 4 filters (read side, pre-built)
- [ ] #24 Manual split override (D)
- [ ] #25 Backorder + consolidation prompt (D)
- [ ] #26 Proration on modify/cancel (D)
- [ ] #29 Empty/loading/error states — done for A & B's screens only; **not yet audited on C/D's screens**
- [ ] #30 Nudge/escalate actions (D)
- [ ] #31 Delivery slippage — detection/display done; action wiring not done (D)

## P2 polish

- [x] #32 Variants editor + multi-currency price lists (A)
- [x] #34 Pagination/search — done for quotations; not verified on approvals/subscriptions/invoices lists
- [ ] #33 CSV/PDF export (D)
- [ ] #35 Notification centre UI (C)
- [ ] #36 Magic-link reissue flow (expiry message exists; reissue doesn't) (C)
- [ ] #37 Avg-approval-time SLA highlighting (D)
- [ ] #38 Merge-prompt UX on stale version (current bar — a clear toast — is met; the fancier merge UI is not built)

## P3 — explicitly out of scope, nothing to do

Sockets, email delivery, multi-tenant, drag-and-drop persistence,
variant-level stock, forecasting, approval delegation — all correctly
deferred per `DECISIONS.md`.

## Cross-module contract tests (`AGENT_E_INTEGRATION.md`)

| # | Test | Status |
|---|---|---|
| 1 | Admin raises Gold + Services to 20% ⇒ Q-1042 auto-approves | ✅ smoke 12 |
| 2 | Laptop 12% / Setup 18% ⇒ 33, HIGH, chain, explanation table | ✅ smoke 2 + reset 3 |
| 3 | Return ⇒ edit ⇒ resubmit ⇒ 3 audit entries in order | ✅ reset 4 (seeded); live resubmit path built by B, blocked end-to-end on C's `/return` |
| 4 | Portal scoped to Priya only; R. Das / internal JWT / expired token all correctly refused | ✅ smoke 7 |
| 5 | Counter beyond threshold ⇒ automatic re-approval | ❌ blocked on C |
| 6 | Confirm ⇒ split across Main 18 + East 6, reserved, rationale | ❌ blocked on C + D |
| 7 | Restock ⇒ consolidation prompt | ❌ blocked on D |
| 8 | Hybrid order ⇒ one-time invoice + recurring schedule, no shared line | ✅ smoke 6 + reset 6 (seeded); live generation blocked on D |
| 9 | Payment ⇒ invoice PAID, stepper advances, KPIs update | ❌ blocked on D |
| 10 | Idle deal ⇒ Stalled Deals; nudge writes an activity | ✅ reset 7 (detection); nudge action blocked on D |
| 11 | All seven credentials authenticate and land correctly | ✅ smoke 0 + reset 2 |

---

## Build health

- [x] `npm run verify` green: build + typecheck + lint (0 warnings) + 99 unit tests + reset (13/13) + smoke
- [x] Smoke: **10 passing, 0 failing, 3 pending** — steps 5 (warehouse split), 8 (portal counter), 9 (payment), all correctly attributed to D/C
- [ ] Cross-module contract tests #5, #6, #7, #9 (above) — blocked on C and D
- [ ] Full demo script rehearsal (`DEMO_SCRIPT.md`) — needs C's re-approval loop + D's split/billing/payment live, not just seeded

**Bottom line:** A and B are fully done and verified in-browser. C and D's
read sides were pre-scaffolded and work; their write sides — approve /
return / reject, the counter-offer re-approval loop, order / fulfillment /
billing / payment, deal-health actions — are the entire remaining scope. Per
`DECISIONS.md`'s cut-line rehearsal, the re-approval loop (C) and the
warehouse split with rationale (D) are the two things that must not be cut.
