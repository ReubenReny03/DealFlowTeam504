# Agent A — Foundation, Auth & Admin Configuration

> **You are the critical path.** Three other people are blocked until your
> Phase-3 deliverables land. Front-load everything, and be done by **T+6**.

## Mission

Own the ground everyone else stands on: the shared contract, authentication and
role guards, the level-0 reset, the UI kit and the three shells, and the
configuration area that the entire risk engine reads from.

## Your slice of the user journey

**`USER_FLOWS.md` §C steps 1–3** — the Admin sets the governance rules, stocks
the warehouses, and the rep signs in.
**§D "A. Verma — Admin"**, all of it.
**§B first-run onboarding**, all of it — the empty states are your copy.
**§E11** (a rep hits a screen they have no rights to) and **§E14** (governance
not configured) are yours.

**Where you hand off:**

- → **everyone**, the moment `packages/shared`, auth, the UI kit and the shells
  are merged. This is the T+6 gate.
- → **Agent B** at §C step 4: the rep opens the workspace, your shell renders,
  and B's dashboard and builder fill it.
- → **Agent B and C**, continuously: they read your `ApprovalChainConfig` for
  every risk score and every routing decision.

## Why this matters to the demo

Judging moment **#7** is yours: the Admin changes a discount ceiling and the
system's behaviour changes live — the strongest possible proof that nothing is
hardcoded. Moment **#8** (never a blank screen, one-click role switching) is
yours too. And the demo panel is what lets the presenter switch personas on stage
without typing.

---

## Files you own (exclusive)

```
packages/shared/**                          you are the steward; changes are logged
apps/api/src/config/**
apps/api/src/db/**
apps/api/src/middleware/**
apps/api/src/utils/**
apps/api/src/modules/auth/**
apps/api/src/modules/users/**
apps/api/src/modules/customers/**
apps/api/src/modules/products/**
apps/api/src/modules/pricelists/**
apps/api/src/modules/warehouses/**
apps/api/src/modules/subscriptionPlans/**
apps/api/src/modules/config/**
apps/api/src/modules/health.router.ts
apps/api/src/modules/module.health.ts
apps/api/src/modules/readonly.factory.ts
apps/api/src/seed/ids.ts · context.ts · build.ts · catalog.ts · seed.ts
apps/api/src/seed/users.seed.ts             the credential source of truth
apps/api/src/seed/modules/config.seed.ts
apps/api/src/seed/modules/customers.seed.ts
apps/api/src/seed/modules/products.seed.ts
apps/api/src/seed/modules/warehouses.seed.ts
apps/api/src/seed/modules/plans.seed.ts
scripts/**
apps/web/src/app/core/**
apps/web/src/app/shared/**
apps/web/src/app/layouts/**
apps/web/src/app/features/auth/**
apps/web/src/app/features/admin/**
apps/web/src/environments/**
```

## Files you may append to (one line only)

- `apps/api/src/routes.registry.ts`
- `apps/api/src/seed/seeds.registry.ts`
- `apps/web/src/app/app.routes.ts` — the `/admin` children block
- `docs/CONTRACT_CHANGELOG.md` — a row per shared-contract change

## Files you must never touch

`apps/api/src/app.ts` (frozen) · any `modules/` folder owned by B, C or D ·
any `features/` folder owned by B, C or D · `apps/web/src/app/portal/**`

---

## Contracts you consume

Nothing. You are the root of the graph.

## Contracts you produce

| Type / export | From | Consumed by |
|---|---|---|
| every enum and DTO in `@dealflow/shared` | `packages/shared` | **everyone** |
| `calculateBlendedRisk`, `resolveApprovalChain`, `RiskAssessment`, `RiskExplanationRow` | `logic/risk.ts` | B, C |
| `computeLinePricing`, `computeQuoteTotals`, `computeMargin`, `PricedLine` | `logic/pricing.ts` | B |
| `planWarehouseSplit`, `checkBackorderConsolidation` | `logic/warehouse.ts` | D |
| `prorate`, `nextBillingDates`, `buildBillingSchedule`, `invoiceableOneTimeLines` | `logic/billing.ts` | D |
| `rankUpsells` | `logic/upsell.ts` | B |
| `evaluateDealHealth` and the three detectors | `logic/dealHealth.ts` | D |
| `Money`, `money()`, `formatMoney`, date helpers | `util/` | everyone |
| `STAGE_LABEL`, `STATUS_COLORS`, `EMPTY_STATES`, `INTERNAL_NAV`, `LANDING_ROUTE` | `constants.ts` | everyone |
| `requireAuth(roles)`, `requirePortalToken`, `assertPortalScope` | `middleware/auth.ts` | B, C, D |
| `asyncHandler`, `ok`, `created`, `paginate`, `toDto`, `writeAudit` | `utils/` | B, C, D |
| `mountReadonly`, `mountModuleHealth` | `modules/` | B, C, D |
| `loadRiskConfig()`, `toRiskConfig()` | `modules/config/config.service.ts` | **B, C** |
| `SessionStore`, `ToastStore`, `ApiService`, all guards | `web/core/` | B, C, D |
| the entire UI kit + pipes | `web/shared/ui/` | B, C, D |
| `InternalShell`, `AdminShell`, `PortalShell` | `web/layouts/` | B, C, D |

## Your features from `FEATURE_PRIORITY.md`

**P0:** #1 shared contract [BLOCKING] · #3 seed + reset [BLOCKING] · #4 auth +
guards + demo logins [BLOCKING] · #5 admin config · #6 UI kit + shells + routing
[BLOCKING] · #7 catalogue + price lists · #2 risk engine (with B)
**P1:** #21 live re-evaluation on a ceiling change
**P2:** #32 variants editor + multi-currency

---

## Tasks

### T+0 → T+2 — the contract *(everyone is blocked until this lands)*

| # | Task | Done when |
|---|---|---|
| A-1 | Enums, entity DTOs, request/response DTOs, the API envelope | `npm run build:shared` passes; B, C and D can import every type they need |
| A-2 | The nine pure functions with their unit tests | `npm run test` green; **`calculateBlendedRisk` returns exactly 33 for the Q-1042 example** |
| A-3 | `constants.ts` — labels, colours, nav, empty-state copy | every string the UI shows comes from here, not from a template |

**Merge and announce at T+2.** Do not hold the contract while you polish
something else.

### T+2 → T+4 — data and the reset

| # | Task | Done when |
|---|---|---|
| A-4 | The 22 Mongoose models with explicit indexes | `syncAllIndexes()` builds them all |
| A-5 | `users.seed.ts` — the 7 personas, bcrypt-hashed | every one authenticates |
| A-6 | The config, customer, product, warehouse and plan seeds | screens 16, 17 and 18 are non-empty |
| A-7 | **`scripts/reset-env.ts`** — wipe, indexes, seed, 13 assertions, summary | `npm run reset` prints `Level-0 ready ✅` in under 30 s |
| A-8 | `npm run reset:check`, `--keep-config`, `--minimal`, the non-local guard rail | each flag does what `RUNBOOK.md` says |

**Announce at T+4:** "the reset works, and here are the credentials."

### T+4 → T+6 — the shells *(this is the T+6 gate)*

| # | Task | Done when |
|---|---|---|
| A-9 | `app.ts`, the route registry, error handling, Zod validation, `requireAuth`, `requirePortalToken` | `npm run dev:api` is green and `/_routes` lists every module |
| A-10 | Auth module: login, signup, `/me`, `/demo-accounts` | all seven sign in and land correctly |
| A-11 | The UI kit — every component in `UI_SPEC.md`'s table | B, C and D can build a screen without writing a component |
| A-12 | The three shells + `app.routes.ts` + the guards | every route renders in its correct shell; a rep hitting `/app/approvals` is bounced with an explanation |
| A-13 | Screen 1 with the Demo accounts panel | one click signs in as any persona |
| A-14 | Mock mode (`environment.useMocks` + fixtures) | the app renders with the API stopped |

**At T+6, post in the channel: "shells are up, everyone unblocked."** If you are
going to miss T+6, say so at T+4, not T+6 — the others switch to mock mode.

### T+6 → T+10 — the admin area

| # | Task | Done when |
|---|---|---|
| A-15 | Screen 18 — ceilings, thresholds, the chain table, a mandatory reason | saving works and requires a reason |
| A-16 | **`PUT /config` re-evaluates every open quotation** | raising Gold + Services to 20% turns Q-1042 from 33/HIGH into 0/auto-approved, and the response says which quotes moved |
| A-17 | Screen 16 — the three tiles and the table, all computed | counts are real, never constants |
| A-18 | Screen 17 — general info, variants, price lists | matches the mockup's three blocks |

### T+10 → T+14 — catalogue writes

| # | Task | Done when |
|---|---|---|
| A-19 | `POST`/`PUT /products`, the variant grid editor | + New Product works end to end |
| A-20 | `PUT /pricelists/:id` — edit a tier's rule | changing Gold to −15% moves Acme's line prices |
| A-21 | `POST`/`PUT /warehouses` — including replenishment rules | a new warehouse participates in the split planner |
| A-22 | `POST /subscription-plans` | + New Plan (Admin) works |

### T+14 → T+18 — hardening

| # | Task | Done when |
|---|---|---|
| A-23 | Empty, loading and error states audited on all 18 screens | no screen can render blank |
| A-24 | 401/403 redirect behaviour, the session-expiry banner | matches `USER_FLOWS.md` §E11, §E13 |
| A-25 | Take a turn as rotating integrator | see `AGENT_E_INTEGRATION.md` |

---

## Acceptance tests you must make pass

1. `npm run test` — 99 unit tests, including the Q-1042 → 33 case
2. `npm run reset` — all 13 assertions, `Level-0 ready ✅`
3. `npm run reset:check` — passes on a healthy environment, fails loudly on a
   corrupted one
4. `npm run smoke` step 0 — all seven credentials authenticate and land correctly
5. `npm run smoke` step 1 — Gold 15% / Services 10%, ≥2 warehouses, ≥1 plan
6. `npm run smoke` step 12 — **a ceiling change re-scores Q-1042 from 33 to 0
   and auto-approves it**
7. `npm run verify` — the whole chain, green

## Seed data you own

The governance config · the 7 users · 3 price lists · 6 customers · 10 products
with variants and pairings · 2 warehouses · 8 stock rows · 4 subscription plans.

**Non-negotiable seeded values** (other people's tests depend on them):

| | |
|---|---|
| Tier ceilings | Bronze 5 · Silver 10 · **Gold 15** |
| Category ceilings | Hardware 15 · **Services 10** · Subscription 5 |
| Thresholds | medium ≥ 1 · high ≥ 30 · hard escalation ≥ 8 · weights 7 and 3 |
| Laptop Pro 14 | $1,200 base, cost $820, Hardware |
| Onsite Setup Service | $450 base, cost $180, **Services** |
| Main Warehouse laptop stock | 40 in / 22 reserved / **18 available** |
| East Depot laptop stock | 10 in / 4 reserved / **6 available** |
| Main / East shipping weight | 1.0 / 1.4 |
| Main / East shipment cost | $24 + $1/unit · $20 + $1/unit |

Change any of those and Q-1042 stops scoring 33, or the split stops producing
18 + 6. Both are asserted in three places.

## Known risks and mitigations

| Risk | Mitigation |
|---|---|
| **You slip past T+6 and stall three people** | Ship the contract at T+2 *separately*. B, C and D can build against types and mock mode long before your screens exist. |
| Someone needs a shared type you have not written | Add it, log it in `CONTRACT_CHANGELOG.md`, merge it alone. Never batch a contract change with a feature. |
| Mongoose generics blow the TypeScript heap | Already handled — models are `Model<any>` (D-008). Do not "improve" this. |
| Docker is unavailable on a teammate's machine | Already handled — the in-memory fallback. Do not remove it. |
| A seeded value drifts and other tests break | The reset assertions catch it. If one fails, fix the seed, never the assertion. |
| Credentials drift between docs and reality | `npm run docs:credentials` regenerates both. Never hand-edit the table. |

---

## Prompt block for your AI agent

```
You are Agent A on DealFlow360, a 4-person 24-hour hackathon build.
Repo: <path>. Stack: Node/Express/TypeScript + MongoDB/Mongoose + Angular 17
standalone/signals + npm workspaces.

READ FIRST, IN THIS ORDER:
  docs/MASTER_SPEC.md · docs/USER_FLOWS.md (§B, §C steps 1-3, §D Admin, §E11, §E14)
  docs/AGENT_A.md (this is your brief) · docs/BUSINESS_RULES.md · docs/DECISIONS.md

YOU ARE THE CRITICAL PATH. Three other agents are blocked until your Phase 3
deliverables merge. Front-load. Be done by T+6.

YOU OWN (exclusively): packages/shared/**, apps/api/src/{config,db,middleware,
utils}/**, apps/api/src/modules/{auth,users,customers,products,pricelists,
warehouses,subscriptionPlans,config}/**, apps/api/src/seed/{ids,context,build,
catalog,seed,users.seed}.ts + seed/modules/{config,customers,products,
warehouses,plans}.seed.ts, scripts/**, apps/web/src/app/{core,shared,layouts}/**,
apps/web/src/app/features/{auth,admin}/**, apps/web/src/environments/**.

NEVER TOUCH: apps/api/src/app.ts (frozen), any module or feature folder owned by
B, C or D, apps/web/src/app/portal/**.

APPEND ONE LINE ONLY to: routes.registry.ts, seeds.registry.ts, app.routes.ts
(the /admin block), docs/CONTRACT_CHANGELOG.md.

NON-NEGOTIABLE:
- Money is an integer count of cents. Never a float.
- Every business rule is a PURE function in packages/shared, unit-tested, and
  imported by BOTH the API and the Angular app. Never duplicate a rule.
- calculateBlendedRisk MUST return exactly 33 for the Q-1042 example
  (Laptop x2 @ $1200 12%/15%, Setup x1 @ $450 18%/10%, Gold).
- npm run reset must rebuild everything and pass all 13 assertions in under 30s.
- docs/CREDENTIALS.md is GENERATED from users.seed.ts. Never hand-edit it.
- Every screen has loading, error, empty and content states. Never a blank div.
- Angular: `@else if (x; as y)` is NOT supported. Use
  `@else { @if (x; as y) { ... } }`.

WORK IN THIS ORDER (docs/AGENT_A.md has the full task table):
  T+2  A-1..A-3  the shared contract  -> MERGE AND ANNOUNCE IMMEDIATELY
  T+4  A-4..A-8  models, seed, reset
  T+6  A-9..A-14 API shell, auth, UI kit, shells, screen 1  -> ANNOUNCE "unblocked"
  T+10 A-15..A-18 screens 16, 17, 18 + live config re-evaluation
  T+14 A-19..A-22 catalogue writes
  T+18 A-23..A-25 hardening + integration duty

DEFINITION OF DONE for every task: `npm run verify` is green (build, typecheck,
lint, 99 unit tests, reset with 13 assertions, smoke). Your smoke steps are
0, 1 and 12.

Ask me before changing anything in packages/shared after T+6.
Start with A-1. Show me the plan first.
```
