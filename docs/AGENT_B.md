# Agent B — Quotation Builder, Pricing, Risk & Upsell

> You own the **single most-watched screen in the demo**. The live margin and the
> instant `OVER (+8pt)` have to feel real-time, because they are the first thing
> a judge sees working.

## Mission

The quotation builder end to end: line management, tier and price-list
resolution, tax, the live margin indicator, the blended risk integration with its
per-line explanation payload, the upsell ranking endpoint, and the submit path
that **either auto-approves or opens the approval chain**.

## Your slice of the user journey

**`USER_FLOWS.md` §C steps 3–8** — the rep opens the workspace, opens Q-1042,
accepts an upsell and watches the margin move, discounts the service line and
watches it flip to OVER, submits, and the system intercepts by itself.
**§D "J. Rao — Sales Rep"**, all of it — including saving a draft and coming back.
**§E2** (no approval needed at all) and **§E12** (the network drops mid-save).

**Where you hand off:**

- ← **Agent A** gives you the pure functions, the config service, the UI kit and
  the shells. Until they land, work against mock mode.
- → **Agent C** at §C step 8. **`POST /quotations/:id/submit` is the hard
  handoff** — it creates the approval record C's whole workstream operates on.
  **It must land by T+11.** If it will not, tell C at the T+8 checkpoint so they
  work against the seeded approvals instead.
- → **Agent D** indirectly: the quotation lines you build become order lines.

## Why this matters to the demo

Beats 2 and 3 of the script (0:20–1:20) are entirely yours. The moment a judge
sees the margin move on a click and the status cell flip on a tab-out, they
believe the rest. Judging moment **#1** starts here — the risk score has to be
*right* on your screen before it can be *explained* on Agent C's.

---

## Files you own (exclusive)

```
apps/api/src/modules/quotations/**
apps/api/src/modules/pricing/**
apps/api/src/modules/risk/**
apps/api/src/modules/upsell/**
apps/api/src/seed/modules/quotations.seed.ts
apps/web/src/app/features/dashboard/**
apps/web/src/app/features/quotations/**
apps/web/src/app/core/state/quotation-builder.store.ts
```

## Files you may append to (one line only)

- `apps/api/src/routes.registry.ts`
- `apps/api/src/seed/seeds.registry.ts`
- `apps/web/src/app/app.routes.ts` — the `/app/quotations` and `/app/dashboard` entries
- `apps/web/src/app/core/api/mock.data.ts` — your own fixtures

## Files you must never touch

`packages/shared/**` (ask Agent A) · `app.ts` · `core/`, `shared/`, `layouts/` ·
anything owned by A, C or D

---

## Contracts you consume

| From | What |
|---|---|
| `@dealflow/shared` | `computeLinePricing`, `computeQuoteTotals`, `computeMargin`, `resolvePriceListPrice`, `calculateBlendedRisk`, `rankUpsells`, `PricedLine`, `QuotationDto`, `QuotationLineDto`, `RiskAssessmentDto`, `UpsellSuggestionDto`, `LineDiscountStatus`, `QuoteStage`, `Money` |
| Agent A's API | `loadRiskConfig()`, `requireAuth()`, `asyncHandler`, `ok`, `toDto`, `writeAudit`, `mountReadonly`, `mountModuleHealth` |
| Agent A's web | `ApiService`, `SessionStore`, `ToastStore`, the whole UI kit, `InternalShell` |

## Contracts you produce

| What | Consumed by |
|---|---|
| `POST /quotations/:id/submit` → `SubmitQuotationResponse` with `approval` | **Agent C — this is the handoff** |
| `QuotationDto` with populated `lines`, `totals` and `risk` | C (approval screen), D (order creation) |
| `GET /quotations/dashboard`, `/board` | the dashboard and Kanban |
| `GET /upsell/suggestions` | your own panel; also proves smoke step 4 |
| `quotations.seed.ts` — Q-1042 and friends | **everyone**; C's approvals and D's orders reference them |

## Your features from `FEATURE_PRIORITY.md`

**P0:** #8 quotation builder with live totals and margin · #9 submit → auto-approve
or open the chain **[BLOCKING for C]**
**P1:** #20 upsell panel with instant margin delta · #27 Kanban view
**P2:** #38 optimistic-concurrency UX

---

## Tasks

### T+0 → T+2 — read and plan *(A has not landed the contract yet)*

| # | Task | Done when |
|---|---|---|
| B-1 | Read `MASTER_SPEC`, `USER_FLOWS` §C/§D, `BUSINESS_RULES` §1–2, `UI_SPEC` screens 2–4 | you can state the Q-1042 example from memory |
| B-2 | Sketch `QuotationBuilderStore`'s computed graph on paper | you know which signal derives from which |

### T+2 → T+6 — the read side and the seed

| # | Task | Done when |
|---|---|---|
| B-3 | `quotations.seed.ts` — Q-1042 and the rest, **built through `buildQuotation()` so every total and score is computed, never typed** | `npm run reset` assertion 3 passes: Q-1042 scores 33 / HIGH / `[SALES_MANAGER, FINANCE]` |
| B-4 | `GET /quotations`, `/:id`, `/board`, `/dashboard` | screens 2 and 3 render real data |
| B-5 | Screen 3 — Kanban and table, with the toggle | all five columns, cards match `UI_SPEC.md` |

> Work in mock mode until A's shells land at T+6. Do not sit idle.

### T+6 → T+10 — the builder *(your headline)*

| # | Task | Done when |
|---|---|---|
| B-6 | `QuotationBuilderStore` — every `computed()` in `UI_SPEC.md` | changing a quantity in the console updates `totals()`, `margin()` and `risk()` **synchronously** |
| B-7 | Screen 4 — the line table with the **Limit** and **Status** columns | typing 18 into a service line flips it to `OVER (+8pt)` on blur, with no request |
| B-8 | The live totals and margin panel, colour-coded | margin turns amber under 20%, rose under 10% |
| B-9 | The live blended-risk card with the engine's own `summary` | it says which chain a submit would open, before submitting |
| B-10 | `POST /quotations` and `PATCH /quotations/:id`, with the `version` guard | a stale version returns `409 STALE_VERSION` and the UI says "reload and try again" |

### T+10 → T+11 — **the handoff. Do not let this slip.**

| # | Task | Done when |
|---|---|---|
| B-11 | **`POST /quotations/:id/submit`** — load config, compute risk, then **either** set `APPROVED` with a `NOT_REQUIRED` approval **or** create the chain from `risk.requiredChain` with step 0 active | smoke step 3 passes: Q-1042 lands in the queue as HIGH with `[SALES_MANAGER, FINANCE]`, assigned to M. Shah |
| B-12 | Write the `SUBMITTED` audit entry with the risk snapshot | it appears in screen 6's trail |

**Announce the moment this merges.** Agent C is waiting on it.

### T+11 → T+14 — upsell

| # | Task | Done when |
|---|---|---|
| B-13 | `GET /upsell/suggestions?quotationId=` using `rankUpsells` and the seeded pairings | smoke step 4 passes; against Q-1042 it returns Wireless Mouse (+$18), Care Plan 2yr (+$46), Docking Station (promo) |
| B-14 | Wire the panel: **Add to Quote** / **Dismiss** | adding one moves the margin in the same frame and tags the line *from upsell* |
| B-15 | `POST /quotations/preview` and `/pricing/preview` | the server confirms the client's optimistic numbers exactly |

### T+14 → T+18 — polish

| # | Task | Done when |
|---|---|---|
| B-16 | Screen 2 — the three tiles, your quotations, the activity feed | every count is live |
| B-17 | Resubmit after a return, from Draft | the audit trail shows Submitted / Returned / Resubmitted in order |
| B-18 | Search and pagination on the quotation list | 149 seeded quotations stay usable |
| B-19 | Empty, loading and error states on screens 2, 3, 4 | none of them can render blank |
| B-20 | Take a turn as rotating integrator | see `AGENT_E_INTEGRATION.md` |

---

## Definition of done, per task

- `npm run verify` green — build, typecheck, lint, 99 unit tests, reset, smoke
- your smoke steps (2, 3, 4) pass
- every mutation writes an `AuditLog` with actor, role, reason and timestamp
- no business rule is implemented anywhere except `packages/shared`
- the screen has loading, error, empty and content states

## Acceptance tests you must make pass

1. `npm run reset` assertion 3 — Q-1042: score 33, HIGH, chain
   `[SALES_MANAGER, FINANCE]`, `maxSingleOver` 8, two explanation rows
2. `npm run smoke` step 2 — the over-limit line is identified as 8 points over
3. `npm run smoke` step 3 — the quote routed **itself**; the trail has 3 entries
4. `npm run smoke` step 4 — suggestions come back, each with a `marginDelta`
5. **By hand:** type 18 into the setup line and watch the status flip with the
   network tab open. **There must be no request.**
6. **By hand:** a quote with every line inside its limit submits straight to
   `APPROVED` with `autoApproved: true`

## Seed data you own

`quotations.seed.ts` — ten named quotations:

| Number | Customer | Stage | Why it exists |
|---|---|---|---|
| **Q-1042** | Acme Corp (Gold) | Pending Approval | **the demo quote. 2 lines, score 33, HIGH.** |
| Q-1041 | Acme Corp | Confirmed | the prior order behind screens 9, 10, 12, 13 |
| Q-1039 | Beta Industries | Pending Approval | death by a thousand cuts — 3 lines slightly over, MEDIUM |
| Q-1035 | Novus Retail | Approved | risk 0, auto-approved — screen 5's "LOW / Auto-Approved" row |
| Q-1030 | Zenith Co | Negotiation | **idle exactly 9 days** → the stalled-deal alert |
| Q-1032 | Zenith Co | Confirmed | the backorder showcase |
| Q-1036 | Novus Retail | Confirmed | shipped and paid — INV-1039 |
| Q-1043 | Delta LLC | Draft | **32% average discount** → the anomaly alert |
| Q-1045 | Orion Ltd | Draft | returned for revision — screen 5's "1 Returned" |
| Q-1046 | Orion Ltd | Pending Approval | HIGH, already past the Manager → **Finance's queue** |

**Never hand-type a total or a risk score.** Everything goes through
`buildQuotation()` in `seed/build.ts`, which runs the same pure functions the app
does. If you change a quantity or a discount, the score changes — and the reset
assertion will tell you.

## Known risks and mitigations

| Risk | Mitigation |
|---|---|
| **B-11 slips and Agent C is blocked** | C works against the seeded approval records (they already exist and are correct). Flag it at the T+8 checkpoint, not at T+14. |
| Agent A's shells are late | Mock mode. `environment.useMocks = true` and keep building screens. |
| Your client-side risk preview disagrees with the server | It cannot, if you call `calculateBlendedRisk` from `@dealflow/shared` on both sides. **Never write a second implementation.** |
| The margin does not visibly move on an upsell click | That is the demo beat. Make sure everything is `computed()`, not fetched. Test it with the network tab open. |
| Two reps edit the same quote during the demo | The `version` guard returns `409 STALE_VERSION`. Show the message; do not silently overwrite. |
| Seeded quantities drift and Q-1042 stops scoring 33 | Three separate assertions catch it. Fix the seed, never the assertion. |

---

## Prompt block for your AI agent

```
You are Agent B on DealFlow360, a 4-person 24-hour hackathon build.
Repo: <path>. Stack: Node/Express/TypeScript + MongoDB/Mongoose + Angular 17
standalone/signals + npm workspaces.

READ FIRST: docs/MASTER_SPEC.md · docs/USER_FLOWS.md (§C steps 3-8, §D "J. Rao",
§E2, §E12) · docs/AGENT_B.md (your brief) · docs/BUSINESS_RULES.md §1-2, §5 ·
docs/UI_SPEC.md screens 2-4.

YOU OWN THE MOST-WATCHED SCREEN IN THE DEMO. The live margin and the instant
"OVER (+8pt)" must feel real-time.

YOU OWN (exclusively): apps/api/src/modules/{quotations,pricing,risk,upsell}/**,
apps/api/src/seed/modules/quotations.seed.ts,
apps/web/src/app/features/{dashboard,quotations}/**,
apps/web/src/app/core/state/quotation-builder.store.ts

NEVER TOUCH: packages/shared/** (ask Agent A), apps/api/src/app.ts,
apps/web/src/app/{core,shared,layouts}/**, anything owned by A, C or D.

APPEND ONE LINE ONLY to: routes.registry.ts, seeds.registry.ts, app.routes.ts,
core/api/mock.data.ts.

NON-NEGOTIABLE:
- NEVER reimplement a business rule. Import calculateBlendedRisk,
  computeLinePricing, computeQuoteTotals, computeMargin and rankUpsells from
  @dealflow/shared and call them on BOTH the server and the client. That is the
  only reason the optimistic preview cannot disagree with the save.
- The builder's totals, margin and risk are computed() signals recalculated
  SYNCHRONOUSLY on every mutation. No request on a keystroke.
- Money is an integer count of cents.
- Q-1042 MUST score 33 -> HIGH -> [SALES_MANAGER, FINANCE]. Asserted in three
  places. If your seed breaks it, fix the seed, never the assertion.
- Seeded quotations are built with buildQuotation() in seed/build.ts. Never
  hand-type a total or a score.
- POST /quotations/:id/submit computes risk and EITHER auto-approves (risk 0)
  OR creates the approval chain. The rep never chooses. This BLOCKS Agent C and
  must land by T+11.
- Every mutation writes an AuditLog with actor, role, reason and timestamp.
- Angular: `@else if (x; as y)` is NOT supported. Use
  `@else { @if (x; as y) { ... } }`.
- If Agent A's shells are not ready, set environment.useMocks = true and keep
  building. Do not sit idle.

WORK IN THIS ORDER (docs/AGENT_B.md has the full table):
  T+6  B-3..B-5   seed + read endpoints + screen 3
  T+10 B-6..B-10  the builder, the store, the live preview
  T+11 B-11,B-12  POST /submit  <-- HARD HANDOFF TO AGENT C. Announce it.
  T+14 B-13..B-15 the upsell panel
  T+18 B-16..B-20 dashboard, resubmit, pagination, states, integration duty

DEFINITION OF DONE: `npm run verify` green, and smoke steps 2, 3 and 4 pass.

Start with B-3. Show me the plan first.
```
