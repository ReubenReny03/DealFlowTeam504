# Feature priority

The whole product, decomposed and ranked. **This is the team's cut-line
instrument:** when the clock runs out, everyone builds top-down and stops where
they are, and what exists is still a coherent product.

## How the ranking works

Every feature is scored 1–5 on four axes:

| Axis | Question |
|---|---|
| **Demo Impact** | How visible and impressive is it in the five-minute demo? |
| **PS Weight** | How central is it to the problem statement's named pillars — blended risk, hybrid billing, warehouse split, portal negotiation, deal health? |
| **Dep Depth** | How many other features are blocked until this exists? (higher = build sooner) |
| **Cost** | Engineering hours. **Inverted** in the composite, so cheap wins rank up. |

```
composite = DemoImpact x 1.0 + PSWeight x 1.0 + DepDepth x 0.8 + (6 - Cost) x 0.6
```

Dependency depth is weighted below the two value axes but above cost, because in
a 24-hour build a blocker is worse than an expensive feature. Cost is a
tiebreaker, not a driver — nothing important gets cut for being hard.

**[BLOCKING]** means another agent cannot start until it lands. Build those first
whatever else is going on.

---

## P0 — the demo-critical spine

**Rule: if any one of these is missing, there is no submission.** Everything in
P0 is on the golden path. Nothing here may be cut, deferred or half-built. If P0
is at risk at T+14, every agent stops what they are doing and converges on it.

| Rank | Feature | Screens | Owner | Demo | PS | Dep | Est. h | Depends on | Cut consequence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Shared contract** — enums, DTOs, the nine pure functions **[BLOCKING]** | — | A | 3 | 5 | 5 | 3 | — | Nobody can start. Every other row depends on this row. |
| 2 | **Blended risk engine** + explanation payload **[BLOCKING]** | 4, 6 | A→B | 5 | 5 | 5 | 3 | 1 | The product's headline claim disappears. Nothing to demo. |
| 3 | **Seed + level-0 reset** **[BLOCKING]** | all | A | 4 | 3 | 5 | 4 | 1 | Every screen is blank; a broken database costs an hour to fix by hand. |
| 4 | **Auth, roles, guards, demo logins** **[BLOCKING]** | 1 | A | 4 | 3 | 5 | 3 | 1 | No role switching on stage; the portal boundary is unprovable. |
| 5 | **Admin config: tier + category ceilings, approval chain** | 18 | A | 5 | 5 | 5 | 3 | 1, 4 | Risk becomes hardcoded — the single worst thing a judge can find. |
| 6 | **UI kit + three shells + routing** **[BLOCKING]** | all | A | 2 | 1 | 5 | 4 | 4 | Four agents build four different tables. Nothing looks like one product. |
| 7 | **Product catalogue + price lists** | 16, 17 | A | 3 | 3 | 5 | 3 | 1 | Nothing to quote. |
| 8 | **Quotation builder: lines, qty, discount, live totals + margin** | 4 | B | 5 | 5 | 4 | 5 | 1, 6, 7 | The most-watched screen in the demo is gone. |
| 9 | **Submit → auto-approve or open the chain** **[BLOCKING for C]** | 4, 5 | B | 5 | 5 | 4 | 3 | 2, 8 | Nothing ever reaches an approver. The whole middle of the demo dies. |
| 10 | **Approval chain: approve / return / reject, step advance** | 5, 6 | C | 5 | 5 | 3 | 4 | 9 | Quotes enter the queue and never leave it. |
| 11 | **"Why This Quote Was Flagged" table** | 6 | C | 5 | 5 | 1 | 1 | 2, 10 | The risk score becomes a black box. Judging point #1 lost. |
| 12 | **Customer portal: separate surface, scoped token, view a quotation** | 11 | C | 5 | 5 | 3 | 4 | 4, 9 | The problem statement's explicit requirement is unmet. |
| 13 | **Counter-offer + the automatic re-approval loop** | 11, 6 | C | **5** | **5** | 2 | 3 | 10, 12 | The most impressive single moment in the demo is gone. |
| 14 | **Confirm → order creation** **[BLOCKING for D]** | 11 | C→D | 4 | 4 | 4 | 2 | 13 | Nothing ever reaches fulfillment or billing. |
| 15 | **Warehouse split + reservation + rationale** | 7, 8 | D | 5 | 5 | 2 | 4 | 14 | A named pillar disappears; judging point #3 lost. |
| 16 | **Hybrid billing: one-time invoice + recurring schedule** | 9, 10, 12, 13 | D | 5 | 5 | 2 | 4 | 14 | A named pillar disappears; judging point #4 lost. |
| 17 | **Record payment + order stepper** | 13 | D | 4 | 3 | 1 | 2 | 16 | The quick-test flow's last step fails. |
| 18 | **Deal Health: stalled + anomaly tiles and table** | 14 | D | 4 | 5 | 1 | 3 | 3 | A named pillar disappears. |
| 19 | **Audit log written on every state change** | 6, all | C | 4 | 4 | 2 | 2 | 10 | Judging point #6 lost; "all approvals logged" is unmet. |

**P0 total: ~60 engineering hours across 4 people.** That is deliberately under
half the wall-clock budget, because integration always costs more than the plan.

---

## P1 — the differentiators

**Rule: build immediately after P0, in this order.** These are what turn a
working submission into a winning one. Do not start P1 until *your own* P0 rows
are green and merged.

| Rank | Feature | Screens | Owner | Demo | PS | Dep | Est. h | Depends on | Cut consequence |
|---|---|---|---|---|---|---|---|---|---|
| 20 | **Upsell panel with instant margin delta** | 4 | B | 5 | 4 | 1 | 3 | 8 | A named pillar becomes a static list. The "watch the margin move" beat is lost. |
| 21 | **Admin ceiling change re-evaluates open quotes live** | 18 | A | **5** | 4 | 1 | 2 | 5 | Judging point #7 lost — the strongest proof nothing is hardcoded. |
| 22 | **Negative-auth demonstration (R. Das gets 403)** | 11 | C | 4 | 4 | 1 | 1 | 12 | Judging point #5 lost. Five seconds of demo, very high value. |
| 23 | **Audit trail UI on the approval screen** | 6 | C | 4 | 3 | 1 | 2 | 19 | The trail exists but nobody can see it. |
| 24 | **Manual split override, validated + logged** | 8 | D | 4 | 4 | 1 | 3 | 15 | "with manual override" in the brief is unmet. |
| 25 | **Backorder + consolidation prompt** | 8 | D | 4 | 4 | 1 | 3 | 15 | The auto-prompt beat is lost. |
| 26 | **Proration on modify/cancel + credit note** | 10 | D | 4 | 5 | 1 | 4 | 16 | "correct proration" in the brief is unmet. |
| 27 | **Kanban pipeline view** | 3 | B | 4 | 2 | 1 | 2 | 8 | The list still works; the pipeline read is lost. |
| 28 | **Reporting KPIs with all four filters** | 15 | D | 3 | 4 | 1 | 3 | 3 | A required screen is thin. |
| 29 | **Empty / loading / error states on all 18 screens** | all | all | 3 | 1 | 1 | 3 | 6 | A blank screen on stage reads as a bug. |
| 30 | **Nudge / escalate actions** | 14 | D | 3 | 3 | 1 | 2 | 18 | Deal Health becomes read-only. |
| 31 | **Delivery slippage detection** | 14 | D | 2 | 3 | 1 | 2 | 18 | One of three deal-health rules missing. |

---

## P2 — polish and completeness

**Rule: only if P0 and P1 are green at T+19.** Not before. A half-built P2 that
breaks a P0 path is a net loss.

| Rank | Feature | Screens | Owner | Est. h | Cut consequence |
|---|---|---|---|---|---|
| 32 | Product variants editor + multi-currency price lists | 17 | A | 3 | Variants stay read-only. Low demo cost. |
| 33 | CSV export (then PDF/XLS if there is time) | 15 | D | 2 | "Export options" in the brief unmet; say so out loud. |
| 34 | Pagination and search on every list | 3, 5, 9, 12 | all | 3 | Fine at seed scale; would not survive real volume. |
| 35 | Notification centre for nudges and escalations | 2, 14 | C | 3 | Nudges are recorded but not surfaced to the rep. |
| 36 | Magic-link expiry and reissue flow | 11 | C | 2 | The expired-link message exists; reissue does not. |
| 37 | Avg-approval-time SLA breach highlighting | 5, 15 | D | 2 | The metric exists; the alerting does not. |
| 38 | Optimistic-concurrency UX (merge prompt, not just refuse) | 4 | B | 2 | Users are told to reload rather than helped to merge. |

---

## P3 — explicitly out of scope

**Say these out loud in the demo as "what we'd build next".** Naming them is
worth more than half-building one.

| Feature | Why not now |
|---|---|
| Email delivery of quotation links | The link is the artefact; delivering it is plumbing, not product. |
| Multi-company / multi-tenant | An explicit bonus in the brief, not a requirement. Touches every query. |
| Kanban drag-and-drop persistence | The stage is decided by the workflow, not by dragging. Dragging would *lie* about the model. |
| Variant-level stock | Stock is per product per warehouse. Per-variant multiplies the seed and the split planner for no demo gain. |
| Forecasting and pipeline prediction | A different product. |
| Approval delegation / out-of-office | Real, and out of scope for 24 hours. |

---

## The critical path

If any one of these slips, the whole demo slips. Watch this chain, not the board:

```
Shared contract  (A, T+2)
      |
      +-- Risk engine  (A, T+3)  ---------------+
      |                                          |
      +-- Auth + guards + UI kit  (A, T+6)       |
      |         |                                |
      |         +-- Quotation builder  (B, T+10) |
      |                    |                     |
      |                    +-- Submit -> chain  (quotations)  <-- BLOCKS approvals
      |                              |
      |                              +-- Approval chain  (C, T+14)
      |                                        |
      |                                        +-- Portal + counter + re-approval  (C, T+17)
      |                                                  |
      |                                                  +-- Confirm -> order  (portal -> inventory)  <-- BLOCKS fulfillment + billing
      |                                                            |
      |                                                            +-- Split  (D, T+19)
      |                                                            +-- Billing (D, T+19)
      +-- Seed + reset  (A, T+4)  -- everything reads from this
```

**Two hard handoffs: quotations → approvals, and portal → inventory.**

- **B's `submit` must land by T+11.** If it slips, C works against seeded
  approval records (they exist) and integrates later. Say so at the T+8
  checkpoint, not at T+14.
- **C's `confirm` must land by T+17.** If it slips, D triggers order creation
  directly from a confirmed quotation and wires the portal button afterwards.
  D must **not** sit idle waiting: ORD-1032 and ORD-1041 are already seeded, so
  split, billing and payment can all be built and demonstrated against them.

---

## Cut-line rehearsal — "if we lose four hours"

Say the T+14 checkpoint shows P0 rows 13–17 incomplete. **Drop, in this order:**

1. Everything in P2 (nothing there is on the golden path)
2. #31 delivery slippage, #30 nudge/escalate, #28 reporting filters — Deal Health
   keeps its two seeded tiles, read-only
3. #27 Kanban — the table view is already there and does the same job
4. #25 backorder consolidation, #24 manual override — the split still runs and
   still explains itself
5. #26 proration — subscriptions still generate schedules; the *modify* path goes

**Keep, whatever happens:** #2 risk engine, #9 submit-routes-itself, #11 the
flagged-lines table, #13 the re-approval loop, #15 the split with rationale,
#16 hybrid billing, #21 the live ceiling change.

**What the demo becomes:** you lose the polish beats and about 40 seconds. You
keep every judging moment. The narration drops the Deal Health nudge and the
backorder consolidation, and closes on the live ceiling change instead — which is
arguably the stronger ending anyway.

**What you must never cut, and why:** the flagged-lines table (#11) costs one
hour and *is* judging point #1. The re-approval loop (#13) costs three hours and
is the most impressive twenty seconds in the demo. If those two are the only
things that work, you still have a story.

---

## Ownership at a glance

| Agent | P0 rows | P1 rows | Hours (P0) |
|---|---|---|---|
| **A** — Foundation, Auth, Admin | 1, 3, 4, 5, 6, 7, and 2 with B | 21 | ~20 |
| **B** — Quotation, Pricing, Risk, Upsell | 8, 9 | 20, 27 | ~8 |
| **C** — Approvals, Audit, Portal | 10, 11, 12, 13, 14, 19 | 22, 23 | ~16 |
| **D** — Fulfillment, Billing, Deal Health | 15, 16, 17, 18 | 24, 25, 26, 28, 30, 31 | ~13 |

The platform and catalogue domains carry a third of P0 and everything else
reads their configuration. **They must land first and be
done by T+6.** That is why A owns the seed, the reset and the UI kit — the three
things everyone else consumes.

Every P0 and P1 row is owned. No row is unassigned.
