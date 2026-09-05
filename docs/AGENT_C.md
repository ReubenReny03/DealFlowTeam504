# Agent C — Approvals, Audit, Customer Portal & Negotiation

> You own **the most impressive twenty seconds in the demo** — the moment a
> customer's counter-offer sends a quotation back into the approval queue with
> nobody asking. Rehearse it.

## Mission

The approval state machine, the "Why This Quote Was Flagged" renderer, the full
audit trail, the customer portal as a genuinely separate restricted surface, and
the automatic re-approval loop.

## Your slice of the user journey

**`USER_FLOWS.md` §C steps 9–18** — the manager sees it waiting, reads *why*,
returns it, the rep resubmits, two approvals, the customer opens her link,
counters, **the quote re-enters approval by itself**, is re-approved, and she
confirms.
**§D "M. Shah"**, **§D "K. Iyer"** (the approval half), **§D "Priya Menon"** — all
of it.
**§E1** (rejected outright) · **§E3** (confirms without negotiating) ·
**§E9** (expired link) · **§E10** (someone else's quotation → 403).

**Where you hand off:**

- ← **Agent B** at §C step 8: `POST /quotations/:id/submit` creates the approval
  record you operate on. **If B slips past T+11, work against the seeded
  approvals — they already exist and are correct.**
- → **Agent D** at §C step 18: `POST /portal/q/:number/confirm` calls D's order
  creation. **Agree the function signature with D at the T+8 checkpoint.**
  If D is not ready, land confirm without it and wire the call later.

## Why this matters to the demo

Four of the eight judging moments are yours:

- **#1** the flagged-lines table — the risk score explained, not asserted
- **#2** the re-approval loop, live — the single biggest moment
- **#5** the portal is provably restricted — R. Das gets a 403 in five seconds
- **#6** the audit trail with user, timestamp and reason

---

## Files you own (exclusive)

```
apps/api/src/modules/approvals/**
apps/api/src/modules/audit/**
apps/api/src/modules/portal/**
apps/api/src/modules/negotiation/**
apps/api/src/modules/notifications/**
apps/api/src/seed/modules/approvals.seed.ts
apps/web/src/app/features/approvals/**
apps/web/src/app/portal/**
apps/web/src/app/core/state/feature.stores.ts   (the ApprovalStore class only)
```

## Files you may append to (one line only)

- `apps/api/src/routes.registry.ts`
- `apps/api/src/seed/seeds.registry.ts`
- `apps/web/src/app/app.routes.ts` — the `/app/approvals` entries and the
  `/portal` block
- `apps/web/src/app/core/api/mock.data.ts`

## Files you must never touch

`packages/shared/**` (ask Agent A) · `app.ts` · `middleware/auth.ts` (Agent A
owns `requirePortalToken` and `assertPortalScope` — ask if you need a change) ·
anything owned by A, B or D

---

## Contracts you consume

| From | What |
|---|---|
| `@dealflow/shared` | `ApprovalDto`, `ApprovalStepDto`, `ApprovalTrailEntryDto`, `ApprovalStatus`, `ApprovalStepStatus`, `ApprovalAction`, `RiskAssessmentDto`, `RiskExplanationRow`, `PortalResolveResponse`, `PortalCounterResponse`, `PortalConfirmResponse`, `NegotiationEventDto`, `AuditLogDto`, `calculateBlendedRisk`, `resolveApprovalChain` |
| Agent A | `requireAuth(roles)`, **`requirePortalToken`**, **`assertPortalScope`**, `loadRiskConfig()`, `writeAudit()`, the UI kit, `PortalShell` |
| **Agent B** | **`POST /quotations/:id/submit` creates the `Approval` you act on** |
| Agent D | `createOrderFromQuotation(quotationId, actor)` — called by your confirm |

## Contracts you produce

| What | Consumed by |
|---|---|
| `POST /approvals/:id/{approve,return,reject}` | the demo, and the integration suite |
| `ApprovalDto` with `steps`, `trail` and the risk snapshot | screen 6 |
| `POST /portal/q/:number/{comment,counter,confirm}` | the portal, and **D's order creation** |
| `AuditLog` entries for every decision | screen 6, the activity feed, reporting |
| `approvals.seed.ts` — the live queue, the audit trail, Priya's token | **everyone** |

## Your features from `FEATURE_PRIORITY.md`

**P0:** #10 the approval chain · #11 the flagged-lines table · #12 the portal ·
#13 **counter + the automatic re-approval loop** · #14 confirm → order ·
#19 the audit log
**P1:** #22 the negative-auth demonstration · #23 the audit trail UI
**P2:** #35 the notification centre · #36 magic-link reissue

---

## Tasks

### T+0 → T+2 — read and plan

| # | Task | Done when |
|---|---|---|
| C-1 | Read `USER_FLOWS` §C 9–18, §D M. Shah / K. Iyer / Priya, §E1/3/9/10; `BUSINESS_RULES` §7 | you can explain the re-approval loop without notes |
| C-2 | Agree the `createOrderFromQuotation` signature with Agent D | both of you have written it down |

### T+2 → T+8 — the seed and the read side

| # | Task | Done when |
|---|---|---|
| C-3 | `approvals.seed.ts` — 5 live approvals, the audit log, Priya's token (plus an expired one), Q-1030's negotiation history | reset assertions 4 and 8 pass |
| C-4 | `GET /approvals` with counts, `/:id`, `/:id/trail` | screen 5 shows **3 Pending · 1 Returned · 12 Approved** |
| C-5 | Screen 5 — the queue, the chips, the Pending Only filter | matches `UI_SPEC.md` |

### T+8 → T+12 — the approval screen and the state machine

| # | Task | Done when |
|---|---|---|
| C-6 | **Screen 6's "Why This Quote Was Flagged" table** — rendered **verbatim** from `approval.risk.explanation` | Q-1042 shows Laptop 12/15/0 pt OK and Setup 18/10/**8 pt OVER**. **You must not recompute a single number.** |
| C-7 | The stepper: Submitted → each chain role → Confirmed | Q-1042 shows Sales Manager active and Finance waiting |
| C-8 | The audit trail table | Q-1042 shows exactly the three seeded rows, in order |
| C-9 | **`POST /approvals/:id/approve`** — advance the step, or finish and move the quotation to `APPROVED` | a HIGH quote needs two approvals; after the first, `currentStage` becomes FINANCE |
| C-10 | **`POST /approvals/:id/return`** — quotation back to `DRAFT`, reason attached | the rep sees it as a draft with the reason |
| C-11 | **`POST /approvals/:id/reject`** — terminal | §E1 behaves as written |
| C-12 | All three write an `AuditLog` with actor, role, reason, timestamp | the trail grows on every action |
| C-13 | Role enforcement: only the **active step's role** may act | a Sales Manager gets 403 on a Finance-step approval |
| C-14 | The SLA timer — `cycleTimeMs` on decision | Agent D's Avg Approval Time KPI is real |

### T+12 → T+17 — the portal *(your headline)*

| # | Task | Done when |
|---|---|---|
| C-15 | `GET /portal/q/:number` with `assertPortalScope` | smoke step 7: Priya 200 · R. Das 403 · internal JWT 403 · expired token `PORTAL_TOKEN_EXPIRED` |
| C-16 | Screen 11 — lines, per-line comment and counter fields, delivery date, the notice banner | **no margin, no cost, no risk score, no route into the internal app** |
| C-17 | `POST /portal/q/:number/comment` — a question with no counter | §E: the quote does **not** re-enter approval |
| C-18 | **`POST /portal/q/:number/counter`** — apply the terms, **recompute the risk**, and if it breaches: force `PENDING_APPROVAL`, reopen the approval with `reEnteredFromNegotiation: true`, audit `RE_ENTERED_FROM_NEGOTIATION` | **smoke step 8** passes and `reEnteredApproval` is `true` |
| C-19 | The "Back from the customer" panel on screen 6 | the manager can see *why* it came back |
| C-20 | **`POST /portal/q/:number/confirm`** — `CONFIRMED`, then call D's order creation | Agent D's fulfillment and billing light up |
| C-21 | Messages and Profile tabs | the negotiation reads as a conversation |

### T+17 → T+20 — polish

| # | Task | Done when |
|---|---|---|
| C-22 | Notifications for nudges and escalations | the rep sees them |
| C-23 | The rep's reply path on a negotiation event | §D "responds to negotiation requests" works |
| C-24 | Every portal error state, verbatim from `UI_SPEC.md` | an expired link never shows a stack trace |
| C-25 | Take a turn as rotating integrator | see `AGENT_E_INTEGRATION.md` |

---

## Definition of done, per task

- `npm run verify` green
- your smoke steps (3, 7, 8) pass
- **every** decision writes an `AuditLog` with a non-empty reason
- the portal never returns anything an internal user could not also see through
  the internal API — and never accepts an internal JWT
- the flagged-lines table recomputes **nothing**

## Acceptance tests you must make pass

1. `npm run reset` assertion 4 — Q-1042's trail is exactly
   `J. Rao:SUBMITTED → M. Shah:RETURNED → J. Rao:RESUBMITTED`, chronological,
   status PENDING at the Sales Manager
2. `npm run reset` assertion 8 — Priya's token resolves to Q-1042, is scoped to
   Acme, and R. Das does not share that scope
3. `npm run smoke` step 7 — **Priya 200 · R. Das 403 · internal JWT 403 ·
   expired token `PORTAL_TOKEN_EXPIRED`**
4. `npm run smoke` step 8 — a counter re-enters approval automatically;
   `reEnteredApproval: true` and stage `PENDING_APPROVAL`
5. **By hand:** approve as M. Shah, confirm the Finance step activates and the
   quotation is **not yet** approved
6. **By hand:** the flagged-lines table matches `risk.explanation` field for
   field — no arithmetic in the template

## Seed data you own

`approvals.seed.ts`:

| Record | State | Why |
|---|---|---|
| Q-1042's approval | PENDING, Manager active, Finance waiting, **3 trail entries** | the demo quote |
| Q-1039's approval | PENDING, MEDIUM, one step | shows a one-approver chain |
| Q-1046's approval | PENDING, Manager approved, **Finance active** | K. Iyer's queue is non-empty on login |
| Q-1045's approval | RETURNED | screen 5's "1 Returned" chip |
| Q-1035's approval | NOT_REQUIRED, auto-approved | screen 5's "LOW / Auto-Approved" row |
| 10 audit entries | config, discount change, submit, return, resubmit, approve… | screen 6 and the activity feed |
| **Priya's portal token** | live, ten-year TTL | the demo URL |
| An expired token | expired yesterday | §E9 is demoable |
| Q-1030's negotiation events | two customer messages | the Messages tab is non-empty |

## Known risks and mitigations

| Risk | Mitigation |
|---|---|
| **Agent B's `submit` slips past T+11** | The seeded approvals already exist and are correct. Build the whole state machine against them. Raise it at the T+8 checkpoint. |
| **Agent D's order creation is not ready when confirm lands** | Land confirm without it — move the quotation to `CONFIRMED` and log a TODO. Wire the call at the T+19 checkpoint. Do not block. |
| The portal accidentally accepts an internal JWT | `requirePortalToken` already refuses it, and smoke step 7 asserts it. Never loosen that middleware. |
| A portal token leaks between customers | `assertPortalScope` checks both the quotation **and** the customer, server-side. Never trust the URL. |
| The re-approval loop does not fire | It only fires when the recomputed risk breaches. Test with a counter that clearly breaks a limit (25% on a 10%-capped service line). |
| You recompute risk in the template "just to check" | Don't. The engine's `explanation` is the contract. Recomputing is how the number on screen 4 and the number on screen 6 drift apart. |

---

## Prompt block for your AI agent

```
You are Agent C on DealFlow360, a 4-person 24-hour hackathon build.
Repo: <path>. Stack: Node/Express/TypeScript + MongoDB/Mongoose + Angular 17
standalone/signals + npm workspaces.

READ FIRST: docs/MASTER_SPEC.md · docs/USER_FLOWS.md (§C steps 9-18, §D M. Shah /
K. Iyer / Priya, §E1, §E3, §E9, §E10) · docs/AGENT_C.md (your brief) ·
docs/BUSINESS_RULES.md §1, §7 · docs/UI_SPEC.md screens 5, 6, 11.

YOU OWN THE BIGGEST MOMENT IN THE DEMO: a customer's counter-offer sends the
quotation back into the approval queue with nobody asking for it.

YOU OWN (exclusively): apps/api/src/modules/{approvals,audit,portal,negotiation,
notifications}/**, apps/api/src/seed/modules/approvals.seed.ts,
apps/web/src/app/features/approvals/**, apps/web/src/app/portal/**,
the ApprovalStore class in apps/web/src/app/core/state/feature.stores.ts

NEVER TOUCH: packages/shared/** (ask Agent A), apps/api/src/app.ts,
apps/api/src/middleware/auth.ts (Agent A owns it), anything owned by A, B or D.

APPEND ONE LINE ONLY to: routes.registry.ts, seeds.registry.ts, app.routes.ts,
core/api/mock.data.ts.

NON-NEGOTIABLE:
- Screen 6's "Why This Quote Was Flagged" table renders approval.risk.explanation
  VERBATIM. Never recompute a number in the UI. That array is the contract.
- THE RE-APPROVAL LOOP: on a customer counter or confirm, recompute the blended
  risk with calculateBlendedRisk against the CURRENT config. If it now breaches
  the thresholds, force the quotation back to PENDING_APPROVAL, reopen the
  approval with reEnteredFromNegotiation = true, and write an audit entry with
  reason RE_ENTERED_FROM_NEGOTIATION. Nobody requested that review.
- THE PORTAL IS A SEPARATE SURFACE. Its own guard (requirePortalToken), its own
  credential (X-Portal-Token, never a JWT), and a server-side scope check
  (assertPortalScope) tying a token to ONE quotation and ONE customer. An
  internal JWT must get 403. R. Das must get 403 on Acme's quotation whether he
  guesses the URL or reuses Priya's link.
- The portal shows NO margin, NO cost, NO risk score, and has NO route into the
  internal app.
- EVERY approve / return / reject writes an AuditLog with actor, role, reason and
  timestamp. A reason is mandatory on all three.
- Only the ACTIVE step's role may act. A Sales Manager gets 403 on a Finance step.
- Angular: `@else if (x; as y)` is NOT supported. Use
  `@else { @if (x; as y) { ... } }`.
- If Agent B's POST /quotations/:id/submit is not ready, build against the
  SEEDED approval records - they exist and are correct. Do not sit idle.
- Agree createOrderFromQuotation(quotationId, actor) with Agent D at T+8.

WORK IN THIS ORDER (docs/AGENT_C.md has the full table):
  T+8  C-3..C-5   seed, read endpoints, screen 5
  T+12 C-6..C-14  screen 6, the flagged table, the state machine, audit
  T+17 C-15..C-21 the portal, the counter, THE RE-APPROVAL LOOP, confirm
  T+20 C-22..C-25 notifications, rep replies, error states, integration duty

DEFINITION OF DONE: `npm run verify` green, and smoke steps 3, 7 and 8 pass.

Start with C-3. Show me the plan first.
```
