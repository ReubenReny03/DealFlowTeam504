# DealFlow360

**An intelligent, self-governing B2B sales operations platform.**
Quotation → blended-risk approval → customer negotiation → multi-warehouse
fulfillment → hybrid billing → analytics.

Most sales tools take a quote and turn it into an invoice. This one **governs the
deal while it is happening** — it decides who needs to approve it, how to ship
it, and how to bill it, without anyone asking.

---

## Quick start

```bash
cp .env.example .env
npm install
docker compose up -d mongo     # Mongo 7 as a single-node replica set
npm run reset                  # wipe, rebuild, seed, verify → "Level-0 ready ✅"
npm run dev                    # API :3000 · web :4200
```

Open **http://localhost:4200** and click any persona in the **Demo accounts**
panel. No typing.

> **No Docker?** Everything still works. The reset falls back to an ephemeral
> in-memory MongoDB, announces itself, and seeds itself. See
> [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## Demo credentials

<!-- BEGIN GENERATED CREDENTIALS -->

| Persona | Name | Email | Password | Role | Lands on |
|---|---|---|---|---|---|
| Admin | A. Verma | `admin@dealflow360.test` | `Demo@123` | `ADMIN` | /admin/products |
| Sales Rep | J. Rao | `rep@dealflow360.test` | `Demo@123` | `SALES_REP` | /app/dashboard |
| Sales Rep 2 | S. Nair | `rep2@dealflow360.test` | `Demo@123` | `SALES_REP` | /app/dashboard |
| Sales Manager | M. Shah | `manager@dealflow360.test` | `Demo@123` | `SALES_MANAGER` | /app/dashboard |
| Finance | K. Iyer | `finance@dealflow360.test` | `Demo@123` | `FINANCE` | /app/approvals |
| Customer — Acme Corp | Priya Menon | `priya@acmecorp.test` | `Demo@123` | `CUSTOMER` | /portal |
| Customer — Beta Industries | R. Das | `das@betaindustries.test` | `Demo@123` | `CUSTOMER` | /portal |

**Customer portal, ready to click:** http://localhost:4200/portal/q/Q-1042?token=demo-acme-q1042-2f7a91c4b8e04d16 (Acme Corp / Priya)

**And a second company:** http://localhost:4200/portal/q/Q-1038?token=demo-beta-q1038-6c31d0af59b74e28 (Beta Industries / R. Das)

<!-- END GENERATED CREDENTIALS -->

Generated from `apps/api/src/seed/users.seed.ts` — never hand-edited.
Regenerate with `npm run docs:credentials`. Full notes:
[`docs/CREDENTIALS.md`](docs/CREDENTIALS.md).

---

## What it does

| Pillar | What is real about it |
|---|---|
| **Blended discount risk** | Every line is checked against **its own** limit — the stricter of the customer's tier ceiling and the product category's ceiling. A revenue-weighted blended score plus a worst-single-line term decides whether it needs a Sales Manager, then Finance, or nobody at all. The engine returns its own per-line explanation, which the approval screen renders verbatim. |
| **Live upsell** | Ranked from real co-purchase history, promotion flags and margin delta. Adding one moves the margin indicator in the same frame — the browser runs the same pricing functions the server does. |
| **Multi-warehouse split** | Minimise shipments, then weighted cost, then backorder. Reserves stock atomically, supports a validated manual override, and shows its **reasoning** on screen. |
| **Hybrid billing** | One order produces a one-time invoice for the **shipped** quantity **and** a separate recurring schedule billed at the start of each period. Neither ever contains the other. Mid-cycle changes prorate; cancellations issue credit notes. |
| **Customer portal** | A genuinely separate surface: its own shell, its own guard, its own credential, and a server-side scope check. A counter-offer that breaches the thresholds sends the quotation **back into the approval queue automatically**. |
| **Deal health** | Stalled deals, discounts out of character **for that specific rep**, and delivery promises at risk. |

Nothing above is hardcoded. Change a discount ceiling on screen 18 and every open
quotation is re-scored on the spot — some of them stop needing approval entirely.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + web |
| **`npm run reset`** | **level-0 rebuild** — wipe, indexes, seed, 13 assertions |
| `npm run reset:check` | run the assertions only, wipe nothing |
| `npm run demo:reset` | full rebuild + verification. Run this before the demo. |
| `npm run smoke` | the PDF's 8-step quick-test flow, over real HTTP |
| `npm run test` | 99 unit tests on the pure business logic |
| **`npm run verify`** | **build + typecheck + lint + test + reset + smoke.** The merge gate. |
| `npm run docs:credentials` | regenerate the credentials docs from the seed |

Full list and troubleshooting: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## Architecture

```
packages/shared/     THE FROZEN CONTRACT — enums, DTOs, and every business rule
                     as a PURE function, unit-tested, imported by BOTH sides
apps/api/            Express + TypeScript + Mongoose. app.ts is frozen; modules
                     register themselves with one line in routes.registry.ts
apps/web/            Angular 17 standalone + signals + Tailwind. Three shells:
                     internal, admin, and the customer portal
scripts/             the level-0 reset, and the credentials generator
```

**The rule that makes four parallel agents possible:** every type and every
business rule lives in `packages/shared` and is imported by both the API and the
UI. The optimistic preview in the browser cannot disagree with what the server
stores, because they are the same function.

---

## The numbers that matter

The demo quotation, Q-1042 for Acme Corp (Gold tier):

| Line | Given | Tier ceiling | Category ceiling | **Allowed** | Over by |
|---|---|---|---|---|---|
| Laptop Pro 14 ×2 (Hardware) | 12% | 15 | 15 | **15** | 0 |
| Onsite Setup Service ×1 (Services) | 18% | 15 | 10 | **10** | **8** |

```
blendedOverPct = (2400×0 + 450×8) / 2850 = 1.26
maxSingleOver  = 8
riskScore      = round(1.26×7 + 8×3) = 33  →  HIGH  →  [SALES_MANAGER, FINANCE]
```

Asserted in three places: a unit test, a reset assertion, and a smoke step.

---

## Documentation

| | |
|---|---|
| [`MASTER_SPEC.md`](docs/MASTER_SPEC.md) | the whole system in one place — **read first** |
| [`USER_FLOWS.md`](docs/USER_FLOWS.md) | personas, the golden path click by click, every unhappy path |
| [`BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) | every rule with worked numbers and its test |
| [`DATA_MODEL.md`](docs/DATA_MODEL.md) | schemas, indexes, the ER diagram |
| [`API_CONTRACT.md`](docs/API_CONTRACT.md) | every endpoint with example JSON |
| [`UI_SPEC.md`](docs/UI_SPEC.md) | every screen: components, stores, states, exact copy |
| [`FEATURE_PRIORITY.md`](docs/FEATURE_PRIORITY.md) | the ranked cut-line |
| [`AGENT_A.md`](docs/AGENT_A.md) · [`B`](docs/AGENT_B.md) · [`C`](docs/AGENT_C.md) · [`D`](docs/AGENT_D.md) | the four parallel workstreams |
| [`AGENT_E_INTEGRATION.md`](docs/AGENT_E_INTEGRATION.md) | merge protocol, checkpoints, cross-module tests |
| [`DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | the five-minute narration with fallbacks |
| [`RUNBOOK.md`](docs/RUNBOOK.md) | setup, reset, troubleshooting |
| [`DECISIONS.md`](docs/DECISIONS.md) | every judgement call, with its rationale |

---

## Status

`npm run smoke` reports each of the eight quick-test steps as **PASS**,
**PENDING** (naming the agent who owns it) or **FAIL**. A step that is not built
yet is not a broken build; a step that is built and wrong fails the run.

Run it any time to see exactly what is left.
